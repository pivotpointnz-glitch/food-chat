"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, ScanLine } from "lucide-react";
import { resizeImageToBase64 } from "@/lib/imageResize";
import { ConfirmItemsList, type RawParsedItem } from "@/components/ConfirmItemsList";
import { ALL_UNITS } from "@/lib/units";
import type { MealType } from "@/lib/types";

type Mode = "choose" | "plate" | "label";
type Stage = "capture" | "processing" | "confirm" | "label-confirm";

interface LabelData {
  foodName: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
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

export default function PhotoLogPage() {
  const router = useRouter();
  const plateInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("choose");
  const [stage, setStage] = useState<Stage>("capture");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [items, setItems] = useState<RawParsedItem[]>([]);
  const [label, setLabel] = useState<LabelData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Label log state
  const [labelServings, setLabelServings] = useState(1);
  const [labelUnit, setLabelUnit] = useState("g");
  const [labelMeal, setLabelMeal] = useState<MealType>(defaultMealForNow());
  const [labelDate, setLabelDate] = useState(todayDateInputValue());
  const [labelTime, setLabelTime] = useState(nowTimeInputValue());
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  function reset() {
    setMode("choose");
    setStage("capture");
    setPreviewUrl(null);
    setItems([]);
    setLabel(null);
    setError(null);
    if (plateInputRef.current) plateInputRef.current.value = "";
    if (labelInputRef.current) labelInputRef.current.value = "";
  }

  async function handlePlatePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStage("processing");
    try {
      const { base64, mediaType } = await resizeImageToBase64(file);
      const res = await fetch("/api/photo/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setStage("capture"); return; }
      const identified: { name: string }[] = data.items ?? [];
      if (identified.length === 0) {
        setError("Couldn't identify any food. Try a clearer shot, or log manually.");
        setStage("capture");
        return;
      }
      setItems(identified.map((i) => ({ name: i.name })));
      setStage("confirm");
    } catch {
      setError("Something went wrong analyzing the photo.");
      setStage("capture");
    }
  }

  async function handleLabelPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStage("processing");
    try {
      const { base64, mediaType } = await resizeImageToBase64(file, 1600, 0.92);
      const res = await fetch("/api/photo/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setStage("capture"); return; }
      setLabel(data.label);
      setLabelUnit(data.label.servingUnit ?? "g");
      setStage("label-confirm");
    } catch {
      setError("Something went wrong reading the label.");
      setStage("capture");
    }
  }

  async function handleLabelSave() {
    if (!label) return;
    setLabelSaving(true);
    setLabelError(null);

    // Calculate macros scaled by number of servings
    const factor = labelServings;
    const gramsEquivalent = label.servingSize * factor;
    const loggedAt = new Date(`${labelDate}T${labelTime}:00`).toISOString();

    try {
      // Create a one-off custom food to log against, using per-100g values
      // derived from the label's per-serving values.
      const per100Factor = label.servingSize > 0 ? 100 / label.servingSize : 1;
      const createRes = await fetch("/api/foods/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: label.foodName ?? "Scanned food",
          visibility: "private",
          isComposite: false,
          baseUnit: "g",
          defaultQuantity: label.servingSize,
          defaultUnit: label.servingUnit ?? "g",
          caloriesPer100: label.calories * per100Factor,
          proteinPer100: label.protein * per100Factor,
          carbsPer100: label.carbs * per100Factor,
          fatPer100: label.fat * per100Factor,
          fiberPer100: label.fiber * per100Factor,
        }),
      });
      const createData = await createRes.json();
      if (createData.error) { setLabelError(createData.error); setLabelSaving(false); return; }

      // Log it
      const logRes = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodId: createData.food.id,
          quantity: label.servingSize * factor,
          unit: labelUnit,
          gramsEquivalent,
          mealType: labelMeal,
          source: "photo",
          loggedAt,
        }),
      });
      const logData = await logRes.json();
      if (logData.error) { setLabelError(logData.error); setLabelSaving(false); return; }

      router.push("/");
      router.refresh();
    } catch {
      setLabelError("Something went wrong saving.");
      setLabelSaving(false);
    }
  }

  // --- Choose mode ---
  if (mode === "choose") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-6">
        <button onClick={() => router.push("/")} className="text-sm font-medium text-emerald-600">
          ← Cancel
        </button>
        <h1 className="mt-3 text-xl font-semibold text-neutral-900">Log by photo</h1>
        <p className="mt-2 text-sm text-neutral-500">What would you like to photograph?</p>
        <div className="mt-8 space-y-3">
          <button
            onClick={() => { setMode("plate"); plateInputRef.current?.click(); }}
            className="flex w-full items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/30"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Camera size={24} strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Photograph a plate</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                We identify what&rsquo;s on it — you confirm the food and set quantities
              </p>
            </div>
          </button>

          <button
            onClick={() => { setMode("label"); labelInputRef.current?.click(); }}
            className="flex w-full items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/30"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <ScanLine size={24} strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Scan a nutrition label</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Photograph the nutrition panel — we extract macros directly from it
              </p>
            </div>
          </button>
        </div>

        <input ref={plateInputRef} type="file" accept="image/*" capture="environment" onChange={handlePlatePhoto} className="hidden" />
        <input ref={labelInputRef} type="file" accept="image/*" capture="environment" onChange={handleLabelPhoto} className="hidden" />
        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // --- Processing ---
  if (stage === "processing") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-6">
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Photo" className="mt-4 max-h-64 w-full rounded-xl object-cover" />
        )}
        <p className="mt-6 text-center text-sm text-neutral-500">
          {mode === "label" ? "Reading the nutrition label…" : "Looking at your plate…"}
        </p>
      </div>
    );
  }

  // --- Plate confirm ---
  if (stage === "confirm") {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
        <button onClick={reset} className="text-sm font-medium text-emerald-600">← Retake photo</button>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Plate" className="mt-3 max-h-48 w-full rounded-xl object-cover" />
        )}
        <h1 className="mt-3 text-xl font-semibold text-neutral-900">Confirm items</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Here&rsquo;s what we spotted — pick the right match and set the quantity for each.
        </p>
        <ConfirmItemsList rawItems={items} source="photo" showOriginalQuantity={false} onAllSaved={() => { router.push("/"); router.refresh(); }} />
      </div>
    );
  }

  // --- Label confirm ---
  if (stage === "label-confirm" && label) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
        <button onClick={reset} className="text-sm font-medium text-emerald-600">← Retake photo</button>

        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Label" className="mt-3 max-h-48 w-full rounded-xl object-cover" />
        )}

        <h1 className="mt-3 text-xl font-semibold text-neutral-900">
          {label.foodName ?? "Nutrition label"}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Values read from label — adjust serving count if you had more or less than one serving.
        </p>

        {/* Per-serving macro summary from label */}
        <div className="mt-4 grid grid-cols-5 gap-2 rounded-xl bg-neutral-50 p-3 text-center">
          <div>
            <p className="text-base font-semibold text-neutral-900">{Math.round(label.calories * labelServings)}</p>
            <p className="text-xs text-neutral-500">kcal</p>
          </div>
          <div>
            <p className="text-base font-semibold text-neutral-900">{Math.round(label.protein * labelServings)}</p>
            <p className="text-xs text-neutral-500">protein</p>
          </div>
          <div>
            <p className="text-base font-semibold text-neutral-900">{Math.round(label.carbs * labelServings)}</p>
            <p className="text-xs text-neutral-500">carbs</p>
          </div>
          <div>
            <p className="text-base font-semibold text-neutral-900">{Math.round(label.fat * labelServings)}</p>
            <p className="text-xs text-neutral-500">fat</p>
          </div>
          <div>
            <p className="text-base font-semibold text-neutral-900">{Math.round(label.fiber * labelServings)}</p>
            <p className="text-xs text-neutral-500">fiber</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Servings</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={labelServings}
                onChange={(e) => setLabelServings(Number(e.target.value))}
                className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-xs text-neutral-500">× {label.servingSize}{label.servingUnit} per serving</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">Meal</label>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {mealOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLabelMeal(opt.value)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    labelMeal === opt.value
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-neutral-200 text-neutral-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Logged for <span className="text-neutral-400">(change if logging retroactively)</span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="date"
                value={labelDate}
                max={todayDateInputValue()}
                onChange={(e) => setLabelDate(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <input
                type="time"
                value={labelTime}
                onChange={(e) => setLabelTime(e.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {labelError && <p className="mt-3 text-sm text-red-600">{labelError}</p>}

        <button
          onClick={handleLabelSave}
          disabled={labelSaving}
          className="mt-6 w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {labelSaving ? "Saving…" : "Log this"}
        </button>
      </div>
    );
  }

  return null;
}
