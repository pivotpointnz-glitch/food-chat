"use client";

import { useState, useEffect, useCallback } from "react";
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
}

interface ComponentRow {
  food: Food;
  quantity: number;
  unit: string;
  gramsPerEach: number | null; // only used when unit === "each"
  gramsEquivalent: number;
}

export default function NewFoodPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"simple" | "composite">("simple");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("private");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple food fields
  const [defaultUnit, setDefaultUnit] = useState("g");
  const [defaultQuantity, setDefaultQuantity] = useState(100);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);

  // Composite food fields
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [componentQuery, setComponentQuery] = useState("");
  const [personalResults, setPersonalResults] = useState<Food[]>([]);
  const [usdaResults, setUsdaResults] = useState<UsdaResult[]>([]);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setPersonalResults([]);
      setUsdaResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setPersonalResults(data.personal ?? []);
      setUsdaResults(data.usda ?? []);
    } finally {
      setSearching(false);
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

  // Live preview of composite macros, computed the same way the API will.
  const compositeTotals = components.reduce(
    (acc, c) => {
      const factor = c.gramsEquivalent / 100;
      return {
        calories: acc.calories + c.food.calories_per_100 * factor,
        protein: acc.protein + c.food.protein_g_per_100 * factor,
        carbs: acc.carbs + c.food.carbs_g_per_100 * factor,
        fat: acc.fat + c.food.fat_g_per_100 * factor,
        grams: acc.grams + c.gramsEquivalent,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0 }
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

    const payload =
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

    const res = await fetch("/api/foods/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setSaving(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    router.push("/log/new");
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={() => router.back()} className="text-sm font-medium text-emerald-600">
        ← Back
      </button>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Create a custom food</h1>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("simple")}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            mode === "simple"
              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
              : "border-neutral-200 text-neutral-600"
          }`}
        >
          Simple food
        </button>
        <button
          onClick={() => setMode("composite")}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
            mode === "composite"
              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
              : "border-neutral-200 text-neutral-600"
          }`}
        >
          Composite (recipe)
        </button>
      </div>

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

              <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-neutral-50 p-3 text-center">
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(compositeTotals.calories)}
                  </p>
                  <p className="text-xs text-neutral-500">kcal total</p>
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
        {saving ? "Saving…" : "Save food"}
      </button>
    </div>
  );
}
