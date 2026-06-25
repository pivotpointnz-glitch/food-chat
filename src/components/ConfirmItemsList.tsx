"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Food, MealType, LogSource } from "@/lib/types";

interface UsdaResult {
  fdcId: number;
  name: string;
  brand: string | null;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
}

export interface RawParsedItem {
  name: string;
  quantity?: number;
  unit?: string;
}

interface ConfirmItem {
  name: string;
  quantity: number;
  unit: string;
  selectedFood: Food | null;
  loggedQuantity: number;
  mealType: MealType;
  searchQuery: string;
  personalResults: Food[];
  usdaResults: UsdaResult[];
  searching: boolean;
  saved: boolean;
}

function defaultMealForNow(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

function todayDateInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowTimeInputValue(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const mealOptions: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

interface ConfirmItemsListProps {
  rawItems: RawParsedItem[];
  source: LogSource;
  onAllSaved: () => void;
  /** Whether to show the originally-detected quantity/unit in the item label (voice has it, photo doesn't). */
  showOriginalQuantity?: boolean;
}

export function ConfirmItemsList({
  rawItems,
  source,
  onAllSaved,
  showOriginalQuantity = true,
}: ConfirmItemsListProps) {
  const [items, setItems] = useState<ConfirmItem[]>(() =>
    rawItems.map((item) => ({
      name: item.name,
      quantity: item.quantity ?? 100,
      unit: item.unit ?? "g",
      selectedFood: null,
      loggedQuantity: item.quantity ?? 100,
      mealType: defaultMealForNow(),
      searchQuery: item.name,
      personalResults: [],
      usdaResults: [],
      searching: false,
      saved: false,
    }))
  );
  const [savingAll, setSavingAll] = useState(false);

  // Shared date/time for the whole batch — these items all describe one
  // sitting/meal, so one date/time picker covers all of them. Defaults to
  // now, but editable for logging something forgotten earlier.
  const [logDate, setLogDate] = useState(todayDateInputValue());
  const [logTime, setLogTime] = useState(nowTimeInputValue());

  // Per-item guard against stale out-of-order network responses: if
  // someone types quickly, an earlier (shorter) query's response could
  // arrive after a later one and overwrite it with stale results.
  const latestQueryByIndex = useRef<Record<number, string>>({});

  function updateItem(index: number, patch: Partial<ConfirmItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const runItemSearch = useCallback(async (index: number, query: string) => {
    latestQueryByIndex.current[index] = query;

    if (query.trim().length < 2) {
      updateItem(index, { personalResults: [], usdaResults: [] });
      return;
    }
    updateItem(index, { searching: true });
    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      // Stale response guard.
      if (latestQueryByIndex.current[index] !== query) return;

      updateItem(index, {
        personalResults: data.personal ?? [],
        usdaResults: data.usda ?? [],
        searching: false,
      });
    } catch {
      if (latestQueryByIndex.current[index] === query) {
        updateItem(index, { searching: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search-as-you-type per item to reduce request frequency and
  // the chance of out-of-order responses in the first place.
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  function handleSearchInputChange(index: number, value: string) {
    updateItem(index, { searchQuery: value });
    if (debounceTimers.current[index]) clearTimeout(debounceTimers.current[index]);
    debounceTimers.current[index] = setTimeout(() => runItemSearch(index, value), 350);
  }

  // Auto-search each item's default query on mount.
  useEffect(() => {
    items.forEach((item, i) => {
      if (!item.selectedFood && item.personalResults.length === 0 && item.usdaResults.length === 0) {
        runItemSearch(i, item.searchQuery);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectPersonalFood(index: number, food: Food) {
    updateItem(index, { selectedFood: food, loggedQuantity: food.default_quantity });
  }

  async function selectUsdaFood(index: number, result: UsdaResult) {
    const res = await fetch("/api/foods/cache-usda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    const data = await res.json();
    if (data.food) {
      updateItem(index, { selectedFood: data.food, loggedQuantity: data.food.default_quantity });
    }
  }

  async function saveItem(index: number) {
    const item = items[index];
    if (!item.selectedFood) return;

    const loggedAt = new Date(`${logDate}T${logTime}:00`).toISOString();

    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        foodId: item.selectedFood.id,
        quantity: item.loggedQuantity,
        unit: item.selectedFood.default_unit,
        gramsEquivalent: item.loggedQuantity,
        mealType: item.mealType,
        source,
        loggedAt,
      }),
    });

    const data = await res.json();
    if (!data.error) {
      updateItem(index, { saved: true });
    }
  }

  async function saveAll() {
    setSavingAll(true);
    const unsavedConfirmed = items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.selectedFood && !item.saved);

    for (const { i } of unsavedConfirmed) {
      await saveItem(i);
    }
    setSavingAll(false);
    onAllSaved();
  }

  const allConfirmed = items.length > 0 && items.every((it) => it.selectedFood);
  const allSaved = items.length > 0 && items.every((it) => it.saved);

  return (
    <>
      <div className="mt-4">
        <label className="block text-sm font-medium text-neutral-700">
          Logged for <span className="text-neutral-400">(forgot something earlier? change this)</span>
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="date"
            value={logDate}
            max={todayDateInputValue()}
            onChange={(e) => setLogDate(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <input
            type="time"
            value={logTime}
            onChange={(e) => setLogTime(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {items.map((item, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3 ${
              item.saved ? "border-emerald-200 bg-emerald-50" : "border-neutral-100 bg-white"
            }`}
          >
            <p className="text-sm font-medium text-neutral-900">
              {showOriginalQuantity ? (
                <>
                  &ldquo;{item.quantity} {item.unit} {item.name}&rdquo;
                </>
              ) : (
                <>{item.name}</>
              )}
            </p>

            {item.saved ? (
              <p className="mt-2 text-sm text-emerald-700">✓ Logged {item.selectedFood?.name}</p>
            ) : item.selectedFood ? (
              <div className="mt-2">
                <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                  <span className="text-sm text-neutral-800">{item.selectedFood.name}</span>
                  <button
                    onClick={() => updateItem(i, { selectedFood: null })}
                    className="text-xs text-neutral-400 hover:text-red-500"
                  >
                    Change
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    value={item.loggedQuantity}
                    onChange={(e) => updateItem(i, { loggedQuantity: Number(e.target.value) })}
                    className="w-20 rounded border border-neutral-200 px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-neutral-500">{item.selectedFood.default_unit}</span>
                  <select
                    value={item.mealType}
                    onChange={(e) => updateItem(i, { mealType: e.target.value as MealType })}
                    className="ml-auto rounded border border-neutral-200 px-2 py-1 text-xs"
                  >
                    {mealOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <input
                  type="text"
                  value={item.searchQuery}
                  onChange={(e) => handleSearchInputChange(i, e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {item.searching && <p className="mt-1 text-xs text-neutral-400">Searching…</p>}
                {(item.personalResults.length > 0 || item.usdaResults.length > 0) && (
                  <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-neutral-100 rounded-lg border border-neutral-100">
                    {item.personalResults.map((food) => (
                      <button
                        key={food.id}
                        onClick={() => selectPersonalFood(i, food)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                      >
                        {food.name}
                      </button>
                    ))}
                    {item.usdaResults.map((result) => (
                      <button
                        key={result.fdcId}
                        onClick={() => selectUsdaFood(i, result)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                      >
                        {result.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {!allSaved && (
        <button
          onClick={saveAll}
          disabled={!allConfirmed || savingAll}
          className="mt-6 w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {savingAll ? "Saving…" : allConfirmed ? "Log all items" : "Match all items to continue"}
        </button>
      )}

      {allSaved && (
        <button
          onClick={onAllSaved}
          className="mt-6 w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          Done
        </button>
      )}
    </>
  );
}
