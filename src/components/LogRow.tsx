"use client";

import { useState } from "react";
import { Mic, Camera, Pencil, Check, X } from "lucide-react";
import type { LogEntryWithFood, MealType } from "@/lib/types";
import { ALL_UNITS, toGramsEquivalent } from "@/lib/units";

const mealLabels: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const mealOptions: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

function toDateTimeLocal(isoString: string): { date: string; time: string } {
  const d = new Date(isoString);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

export function LogRow({
  log,
  onUpdated,
}: {
  log: LogEntryWithFood;
  onUpdated?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { date: initDate, time: initTime } = toDateTimeLocal(log.logged_at);
  const [quantity, setQuantity] = useState(log.quantity);
  const [unit, setUnit] = useState(log.unit);
  const [gramsPerEach, setGramsPerEach] = useState<number | null>(null);
  const [mealType, setMealType] = useState<MealType>(log.meal_type as MealType);
  const [logDate, setLogDate] = useState(initDate);
  const [logTime, setLogTime] = useState(initTime);

  const time = new Date(log.logged_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/logs/${log.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity,
          unit,
          gramsPerEach,
          mealType,
          loggedAt: new Date(`${logDate}T${logTime}:00`).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setEditing(false);
        onUpdated?.();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Reset to original values
    setQuantity(log.quantity);
    setUnit(log.unit);
    setMealType(log.meal_type as MealType);
    const { date, time: t } = toDateTimeLocal(log.logged_at);
    setLogDate(date);
    setLogTime(t);
    setError(null);
    setEditing(false);
  }

  if (editing) {
    const gramsEq = toGramsEquivalent(quantity, unit, gramsPerEach);
    return (
      <div className="border-b border-neutral-100 py-3 last:border-0">
        <p className="text-sm font-medium text-neutral-900">{log.food.name}</p>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-20 rounded border border-neutral-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
            >
              {ALL_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            {unit === "each" && (
              <div className="flex items-center gap-1 text-xs text-neutral-500">
                <span>=</span>
                <input
                  type="number"
                  value={gramsPerEach ?? 0}
                  onChange={(e) => setGramsPerEach(Number(e.target.value))}
                  className="w-14 rounded border border-neutral-200 px-1 py-1 text-sm"
                />
                <span>g each</span>
              </div>
            )}
            {unit !== "g" && unit !== "each" && (
              <span className="text-xs text-neutral-400">≈{Math.round(gramsEq)}g</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="rounded border border-neutral-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
            >
              {mealOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="time"
              value={logTime}
              onChange={(e) => setLogTime(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              <Check size={12} />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600"
            >
              <X size={12} />
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-3 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900">{log.food.name}</p>
        <p className="flex items-center gap-1 text-xs text-neutral-500">
          <span>
            {log.quantity}{log.unit} · {mealLabels[log.meal_type] ?? log.meal_type} · {time}
          </span>
          {log.source === "voice" && <Mic size={12} strokeWidth={2} className="text-neutral-400" />}
          {log.source === "photo" && <Camera size={12} strokeWidth={2} className="text-neutral-400" />}
        </p>
      </div>
      <div className="flex items-center gap-3 ml-2">
        <div className="text-right text-sm text-neutral-700">
          <p className="font-medium">{Math.round(log.calories)} kcal</p>
          <p className="text-xs text-neutral-500">
            P{Math.round(log.protein_g)} C{Math.round(log.carbs_g)} F{Math.round(log.fat_g)} Fb{Math.round(log.fiber_g)}
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 text-neutral-300 hover:text-emerald-600 transition"
          aria-label="Edit entry"
        >
          <Pencil size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
