"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Food, MealType } from "@/lib/types";

interface UsdaResult {
  fdcId: number;
  name: string;
  brand: string | null;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
}

const mealOptions: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

function defaultMealForNow(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export default function NewLogPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [personalResults, setPersonalResults] = useState<Food[]>([]);
  const [usdaResults, setUsdaResults] = useState<UsdaResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState(100);
  const [mealType, setMealType] = useState<MealType>(defaultMealForNow());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const timeout = setTimeout(() => runSearch(query), 350);
    return () => clearTimeout(timeout);
  }, [query, runSearch]);

  async function selectUsdaFood(result: UsdaResult) {
    setError(null);
    const res = await fetch("/api/foods/cache-usda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setSelectedFood(data.food);
    setQuantity(data.food.default_quantity ?? 100);
  }

  function selectPersonalFood(food: Food) {
    setSelectedFood(food);
    setQuantity(food.default_quantity ?? 100);
  }

  async function handleSave() {
    if (!selectedFood) return;
    setSaving(true);
    setError(null);

    // grams_equivalent: since default_unit is usually 'g' or 'ml' for most
    // foods we cache, quantity already approximates grams. For foods with a
    // different default_unit and a conversion factor, apply it.
    const gramsEquivalent =
      selectedFood.grams_per_default_unit && selectedFood.default_unit !== "g" && selectedFood.default_unit !== "ml"
        ? quantity * selectedFood.grams_per_default_unit
        : quantity;

    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        foodId: selectedFood.id,
        quantity,
        unit: selectedFood.default_unit,
        gramsEquivalent,
        mealType,
        source: "manual",
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    router.push("/");
    router.refresh();
  }

  // --- Quantity/macro preview screen ---
  if (selectedFood) {
    const factor = quantity / 100;
    const preview = {
      calories: selectedFood.calories_per_100 * factor,
      protein: selectedFood.protein_g_per_100 * factor,
      carbs: selectedFood.carbs_g_per_100 * factor,
      fat: selectedFood.fat_g_per_100 * factor,
    };

    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
        <button
          onClick={() => setSelectedFood(null)}
          className="text-sm font-medium text-emerald-600"
        >
          ← Back to search
        </button>

        <h1 className="mt-3 text-xl font-semibold text-neutral-900">{selectedFood.name}</h1>
        {selectedFood.brand && <p className="text-sm text-neutral-500">{selectedFood.brand}</p>}

        <div className="mt-6">
          <label className="block text-sm font-medium text-neutral-700">
            Quantity ({selectedFood.default_unit})
          </label>
          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-lg focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-neutral-700">Meal</label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {mealOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMealType(opt.value)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  mealType === opt.value
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-neutral-200 text-neutral-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2 rounded-xl bg-neutral-50 p-4 text-center">
          <div>
            <p className="text-lg font-semibold text-neutral-900">{Math.round(preview.calories)}</p>
            <p className="text-xs text-neutral-500">kcal</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-neutral-900">{Math.round(preview.protein)}</p>
            <p className="text-xs text-neutral-500">protein</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-neutral-900">{Math.round(preview.carbs)}</p>
            <p className="text-xs text-neutral-500">carbs</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-neutral-900">{Math.round(preview.fat)}</p>
            <p className="text-xs text-neutral-500">fat</p>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Log it"}
        </button>
      </div>
    );
  }

  // --- Search screen ---
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={() => router.push("/")} className="text-sm font-medium text-emerald-600">
        ← Cancel
      </button>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Log food</h1>

      <input
        autoFocus
        type="text"
        placeholder="Search for a food…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-4 w-full rounded-lg border border-neutral-300 px-3 py-3 text-base focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />

      <button
        onClick={() => router.push("/foods/new")}
        className="mt-3 text-sm font-medium text-emerald-600"
      >
        + Create a custom food or recipe
      </button>

      {searching && <p className="mt-3 text-sm text-neutral-400">Searching…</p>}

      {personalResults.length > 0 && (
        <div className="mt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Your foods
          </h2>
          <div className="mt-1 divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white">
            {personalResults.map((food) => (
              <button
                key={food.id}
                onClick={() => selectPersonalFood(food)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {food.name}
                    {food.is_composite && <span className="ml-1 text-emerald-600">★</span>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {Math.round(food.calories_per_100)} kcal / 100{food.base_unit}
                  </p>
                </div>
                <span className="text-neutral-300">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {usdaResults.length > 0 && (
        <div className="mt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            USDA database
          </h2>
          <div className="mt-1 divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white">
            {usdaResults.map((result) => (
              <button
                key={result.fdcId}
                onClick={() => selectUsdaFood(result)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-neutral-50"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">{result.name}</p>
                  <p className="text-xs text-neutral-500">
                    {result.brand ? `${result.brand} · ` : ""}
                    {Math.round(result.caloriesPer100)} kcal / 100g
                  </p>
                </div>
                <span className="text-neutral-300">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!searching && query.trim().length >= 2 && personalResults.length === 0 && usdaResults.length === 0 && (
        <p className="mt-6 text-center text-sm text-neutral-400">No results found.</p>
      )}
    </div>
  );
}
