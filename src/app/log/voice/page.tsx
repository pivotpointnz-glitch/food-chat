"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
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

interface ParsedItem {
  name: string;
  quantity: number;
  unit: string;
}

interface ConfirmItem extends ParsedItem {
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

const mealOptions: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

export default function VoiceLogPage() {
  const router = useRouter();
  const { isSupported, isListening, transcript, error: speechError, start, stop, reset } =
    useSpeechRecognition();

  const [stage, setStage] = useState<"record" | "parsing" | "confirm">("record");
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<ConfirmItem[]>([]);
  const [savingAll, setSavingAll] = useState(false);

  async function handleParse() {
    if (!transcript.trim()) return;
    setStage("parsing");
    setParseError(null);

    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();

      if (data.error) {
        setParseError(data.error);
        setStage("record");
        return;
      }

      const parsedItems: ParsedItem[] = data.items ?? [];
      setItems(
        parsedItems.map((item) => ({
          ...item,
          selectedFood: null,
          loggedQuantity: item.quantity,
          mealType: defaultMealForNow(),
          searchQuery: item.name,
          personalResults: [],
          usdaResults: [],
          searching: false,
          saved: false,
        }))
      );
      setStage("confirm");
    } catch {
      setParseError("Something went wrong parsing the recording.");
      setStage("record");
    }
  }

  function updateItem(index: number, patch: Partial<ConfirmItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const runItemSearch = useCallback(async (index: number, query: string) => {
    if (query.trim().length < 2) {
      updateItem(index, { personalResults: [], usdaResults: [] });
      return;
    }
    updateItem(index, { searching: true });
    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      updateItem(index, {
        personalResults: data.personal ?? [],
        usdaResults: data.usda ?? [],
        searching: false,
      });
    } catch {
      updateItem(index, { searching: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-search each item's default query once we land on the confirm stage.
  useEffect(() => {
    if (stage === "confirm") {
      items.forEach((item, i) => {
        if (!item.selectedFood && item.personalResults.length === 0 && item.usdaResults.length === 0) {
          runItemSearch(i, item.searchQuery);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

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

    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        foodId: item.selectedFood.id,
        quantity: item.loggedQuantity,
        unit: item.selectedFood.default_unit,
        gramsEquivalent: item.loggedQuantity,
        mealType: item.mealType,
        source: "voice",
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
    router.push("/");
    router.refresh();
  }

  const allConfirmed = items.length > 0 && items.every((it) => it.selectedFood);
  const allSaved = items.length > 0 && items.every((it) => it.saved);

  // --- Recording stage ---
  if (stage === "record") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-6">
        <button onClick={() => router.push("/")} className="text-sm font-medium text-emerald-600">
          ← Cancel
        </button>

        <h1 className="mt-3 text-xl font-semibold text-neutral-900">Log by voice</h1>

        {!isSupported ? (
          <p className="mt-6 text-sm text-neutral-500">
            Voice input isn&rsquo;t supported in this browser. Try Chrome, or use manual search
            instead.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-500">
              Tap the mic and say everything you ate, e.g. &ldquo;two eggs, a slice of toast, and a
              coffee with milk.&rdquo;
            </p>

            <div className="mt-10 flex flex-col items-center">
              <button
                onClick={isListening ? stop : start}
                className={`flex h-24 w-24 items-center justify-center rounded-full text-3xl text-white shadow-lg transition ${
                  isListening ? "bg-red-500 animate-pulse" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
                aria-label={isListening ? "Stop recording" : "Start recording"}
              >
                🎙️
              </button>
              <p className="mt-3 text-sm text-neutral-500">
                {isListening ? "Listening… tap to stop" : "Tap to start"}
              </p>
            </div>

            {transcript && (
              <div className="mt-6 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Transcript
                </p>
                <p className="mt-1 text-sm text-neutral-800">{transcript}</p>
              </div>
            )}

            {speechError && <p className="mt-4 text-sm text-red-600">{speechError}</p>}
            {parseError && <p className="mt-4 text-sm text-red-600">{parseError}</p>}

            {transcript && !isListening && (
              <div className="mt-6 flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 rounded-lg border border-neutral-200 px-3 py-3 text-sm font-medium text-neutral-600"
                >
                  Clear
                </button>
                <button
                  onClick={handleParse}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  Continue
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // --- Parsing stage ---
  if (stage === "parsing") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 pt-6">
        <p className="text-sm text-neutral-500">Working out what you ate…</p>
      </div>
    );
  }

  // --- Confirm stage ---
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={() => setStage("record")} className="text-sm font-medium text-emerald-600">
        ← Back
      </button>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Confirm items</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Pick the right match for each item, adjust quantity if needed.
      </p>

      <div className="mt-4 space-y-4">
        {items.map((item, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3 ${
              item.saved ? "border-emerald-200 bg-emerald-50" : "border-neutral-100 bg-white"
            }`}
          >
            <p className="text-sm font-medium text-neutral-900">
              &ldquo;{item.quantity} {item.unit} {item.name}&rdquo;
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
                  onChange={(e) => {
                    updateItem(i, { searchQuery: e.target.value });
                    runItemSearch(i, e.target.value);
                  }}
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
          onClick={() => router.push("/")}
          className="mt-6 w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          Done
        </button>
      )}
    </div>
  );
}
