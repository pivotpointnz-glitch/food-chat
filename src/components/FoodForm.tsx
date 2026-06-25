"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Food } from "@/lib/types";
import { ALL_UNITS, toGramsEquivalent } from "@/lib/units";

interface UsdaResult {
  fdcId: number;
  name: string;
  brand: string | null;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number;
}

interface ComponentRow {
  food: Food;
  quantity: number;
  unit: string;
  gramsPerEach: number | null;
  gramsEquivalent: number;
}

export interface FoodFormInitialData {
  mode: "simple" | "composite";
  name: string;
  visibility: "private" | "shared";
  defaultUnit: string;
  defaultQuantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  components: ComponentRow[];
}

export interface FoodFormPayload {
  name: string;
  visibility: "private" | "shared";
  isComposite: boolean;
  baseUnit: "g" | "ml";
  defaultQuantity: number;
  defaultUnit: string;
  caloriesPer100?: number;
  proteinPer100?: number;
  carbsPer100?: number;
  fatPer100?: number;
  fiberPer100?: number;
  components?: { foodId: string; quantity: number; unit: string; gramsEquivalent: number }[];
}

interface FoodFormProps {
  title: string;
  initialData?: FoodFormInitialData;
  onSave: (payload: FoodFormPayload) => Promise<{ error?: string }>;
  onSaved: () => void;
  saveLabel?: string;
}

export function FoodForm({ title, initialData, onSave, onSaved, saveLabel = "Save food" }: FoodFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"simple" | "composite">(initialData?.mode ?? "simple");
  const [name, setName] = useState(initialData?.name ?? "");
  const [visibility, setVisibility] = useState<"private" | "shared">(
    initialData?.visibility ?? "private"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [defaultUnit, setDefaultUnit] = useState(initialData?.defaultUnit ?? "g");
  const [defaultQuantity, setDefaultQuantity] = useState(initialData?.defaultQuantity ?? 100);
  const [calories, setCalories] = useState(initialData?.calories ?? 0);
  const [protein, setProtein] = useState(initialData?.protein ?? 0);
  const [carbs, setCarbs] = useState(initialData?.carbs ?? 0);
  const [fat, setFat] = useState(initialData?.fat ?? 0);
  const [fiber, setFiber] = useState(initialData?.fiber ?? 0);

  const [components, setComponents] = useState<ComponentRow[]>(initialData?.components ?? []);
  const [componentQuery, setComponentQuery] = useState("");
  const [personalResults, setPersonalResults] = useState<Food[]>([]);
  const [usdaResults, setUsdaResults] = useState<UsdaResult[]>([]);
  const [searching, setSearching] = useState(false);

  const latestQueryRef = useRef("");

  const runSearch = useCallback(async (q: string) => {
    latestQueryRef.current = q;

    if (q.trim().length < 2) {
      setPersonalResults([]);
      setUsdaResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      // Stale response guard: ignore if a newer query has since been typed.
      if (latestQueryRef.current !== q) return;

      setPersonalResults(data.personal ?? []);
      setUsdaResults(data.usda ?? []);
    } finally {
      if (latestQueryRef.current === q) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(componentQuery), 350);
    return () => clearTimeout(t);
  }, [componentQuery, runSearch]);

  function addComponent(food: Food) {
    const unit = food.default_unit in { g: 1, ml: 1 } ? food.default_unit : "g";
    const quantity = food.default_quantity;
    setComponents((prev) => [
      ...prev,
      {
        food,
        quantity,
        unit,
        gramsPerEach: food.grams_per_default_unit ?? null,
        gramsEquivalent: toGramsEquivalent(quantity, unit, food.grams_per_default_unit),
      },
    ]);
    setComponentQuery("");
    setPersonalResults([]);
    setUsdaResults([]);
  }

  async function addUsdaComponent(result: UsdaResult) {
    const res = await fetch("/api/foods/cache-usda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    const data = await res.json();
    if (data.food) addComponent(data.food);
  }

  function updateComponentQuantity(index: number, quantity: number) {
    setComponents((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, quantity, gramsEquivalent: toGramsEquivalent(quantity, c.unit, c.gramsPerEach) }
          : c
      )
    );
  }

  function updateComponentUnit(index: number, unit: string) {
    setComponents((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, unit, gramsEquivalent: toGramsEquivalent(c.quantity, unit, c.gramsPerEach) }
          : c
      )
    );
  }

  function updateComponentGramsPerEach(index: number, gramsPerEach: number) {
    setComponents((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, gramsPerEach, gramsEquivalent: toGramsEquivalent(c.quantity, c.unit, gramsPerEach) }
          : c
      )
    );
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  const compositeTotals = components.reduce(
    (acc, c) => {
      const factor = c.gramsEquivalent / 100;
      return {
        calories: acc.calories + c.food.calories_per_100 * factor,
        protein: acc.protein + c.food.protein_g_per_100 * factor,
        carbs: acc.carbs + c.food.carbs_g_per_100 * factor,
        fat: acc.fat + c.food.fat_g_per_100 * factor,
        fiber: acc.fiber + c.food.fiber_g_per_100 * factor,
        grams: acc.grams + c.gramsEquivalent,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, grams: 0 }
  );

  async function handleSave() {
    if (!name.trim()) {
      setError("Give it a name first.");
      return;
    }
    if (mode === "composite" && components.length === 0) {
      setError("Add at least one component.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: FoodFormPayload =
      mode === "simple"
        ? {
            name,
            visibility,
            isComposite: false,
            baseUnit: defaultUnit === "ml" ? "ml" : "g",
            defaultQuantity,
            defaultUnit,
            caloriesPer100: calories,
            proteinPer100: protein,
            carbsPer100: carbs,
            fatPer100: fat,
            fiberPer100: fiber,
          }
        : {
            name,
            visibility,
            isComposite: true,
            baseUnit: "g",
            defaultQuantity: compositeTotals.grams,
            defaultUnit: "g",
            components: components.map((c) => ({
              foodId: c.food.id,
              quantity: c.quantity,
              unit: c.unit,
              gramsEquivalent: c.gramsEquivalent,
            })),
          };

    const result = await onSave(payload);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onSaved();
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={() => router.back()} className="text-sm font-medium text-emerald-600">
        ← Back
      </button>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">{title}</h1>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("simple")}
          disabled={!!initialData}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
            mode === "simple"
              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
              : "border-neutral-200 text-neutral-600"
          }`}
        >
          Simple food
        </button>
        <button
          onClick={() => setMode("composite")}
          disabled={!!initialData}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
            mode === "composite"
              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
              : "border-neutral-200 text-neutral-600"
          }`}
        >
          Composite (recipe)
        </button>
      </div>
      {initialData && (
        <p className="mt-1 text-xs text-neutral-400">
          Food type can&rsquo;t be changed after creation — delete and recreate if needed.
        </p>
      )}

      <div className="mt-5">
        <label className="block text-sm font-medium text-neutral-700">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={mode === "composite" ? "e.g. My usual smoothie" : "e.g. Tuna in spring water"}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-neutral-700">Visibility</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            onClick={() => setVisibility("private")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              visibility === "private"
                ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                : "border-neutral-200 text-neutral-600"
            }`}
          >
            Private to me
          </button>
          <button
            onClick={() => setVisibility("shared")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              visibility === "shared"
                ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                : "border-neutral-200 text-neutral-600"
            }`}
          >
            Shared with others
          </button>
        </div>
      </div>

      {mode === "simple" ? (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Default quantity</label>
              <input
                type="number"
                value={defaultQuantity}
                onChange={(e) => setDefaultQuantity(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Unit</label>
              <select
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            Enter macros per 100{defaultUnit === "ml" ? "ml" : "g"} — this keeps the math consistent
            no matter how much you log later.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Calories</label>
              <input
                type="number"
                value={calories}
                onChange={(e) => setCalories(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Protein (g)</label>
              <input
                type="number"
                value={protein}
                onChange={(e) => setProtein(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Carbs (g)</label>
              <input
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Fat (g)</label>
              <input
                type="number"
                value={fat}
                onChange={(e) => setFat(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Fiber (g)</label>
              <input
                type="number"
                value={fiber}
                onChange={(e) => setFiber(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <label className="block text-sm font-medium text-neutral-700">Add components</label>
          <input
            type="text"
            value={componentQuery}
            onChange={(e) => setComponentQuery(e.target.value)}
            placeholder="Search for an ingredient…"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />

          {searching && <p className="mt-2 text-xs text-neutral-400">Searching…</p>}

          {personalResults.length > 0 && (
            <div className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-white">
              {personalResults.map((food) => (
                <button
                  key={food.id}
                  onClick={() => addComponent(food)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  <span>{food.name}</span>
                  <span className="text-neutral-300">+</span>
                </button>
              ))}
            </div>
          )}

          {usdaResults.length > 0 && (
            <div className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-white">
              {usdaResults.map((result) => (
                <button
                  key={result.fdcId}
                  onClick={() => addUsdaComponent(result)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  <span>{result.name}</span>
                  <span className="text-neutral-300">+</span>
                </button>
              ))}
            </div>
          )}

          {components.length > 0 && (
            <div className="mt-4 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Components
              </h2>
              {components.map((c, i) => (
                <div
                  key={`${c.food.id}-${i}`}
                  className="rounded-lg border border-neutral-100 bg-white px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-800">{c.food.name}</span>
                    <button
                      onClick={() => removeComponent(i)}
                      className="text-neutral-400 hover:text-red-500"
                      aria-label="Remove component"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      value={c.quantity}
                      onChange={(e) => updateComponentQuantity(i, Number(e.target.value))}
                      className="w-16 rounded border border-neutral-200 px-2 py-1 text-right text-sm"
                    />
                    <select
                      value={c.unit}
                      onChange={(e) => updateComponentUnit(i, e.target.value)}
                      className="rounded border border-neutral-200 px-2 py-1 text-sm"
                    >
                      {ALL_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    {c.unit === "each" && (
                      <span className="flex items-center gap-1 text-xs text-neutral-500">
                        =
                        <input
                          type="number"
                          value={c.gramsPerEach ?? 0}
                          onChange={(e) => updateComponentGramsPerEach(i, Number(e.target.value))}
                          className="w-14 rounded border border-neutral-200 px-1 py-1 text-right text-sm"
                        />
                        g each
                      </span>
                    )}
                    <span className="ml-auto text-xs text-neutral-400">
                      ≈{Math.round(c.gramsEquivalent)}g
                    </span>
                  </div>
                </div>
              ))}

              <div className="mt-3 grid grid-cols-5 gap-2 rounded-xl bg-neutral-50 p-3 text-center">
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(compositeTotals.calories)}
                  </p>
                  <p className="text-xs text-neutral-500">kcal</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(compositeTotals.protein)}
                  </p>
                  <p className="text-xs text-neutral-500">protein</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(compositeTotals.carbs)}
                  </p>
                  <p className="text-xs text-neutral-500">carbs</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(compositeTotals.fat)}
                  </p>
                  <p className="text-xs text-neutral-500">fat</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(compositeTotals.fiber)}
                  </p>
                  <p className="text-xs text-neutral-500">fiber</p>
                </div>
              </div>
              <p className="text-center text-xs text-neutral-400">
                Total weight: {Math.round(compositeTotals.grams)}g
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-6 w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}
