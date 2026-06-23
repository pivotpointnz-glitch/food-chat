import { Mic, Camera } from "lucide-react";
import type { LogEntryWithFood } from "@/lib/types";

const mealLabels: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export function LogRow({ log }: { log: LogEntryWithFood }) {
  const time = new Date(log.logged_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-neutral-900">{log.food.name}</p>
        <p className="flex items-center gap-1 text-xs text-neutral-500">
          <span>
            {log.quantity}
            {log.unit} · {mealLabels[log.meal_type] ?? log.meal_type} · {time}
          </span>
          {log.source === "voice" && <Mic size={12} strokeWidth={2} className="text-neutral-400" />}
          {log.source === "photo" && <Camera size={12} strokeWidth={2} className="text-neutral-400" />}
        </p>
      </div>
      <div className="text-right text-sm text-neutral-700">
        <p className="font-medium">{Math.round(log.calories)} kcal</p>
        <p className="text-xs text-neutral-500">
          P{Math.round(log.protein_g)} C{Math.round(log.carbs_g)} F{Math.round(log.fat_g)}
        </p>
      </div>
    </div>
  );
}
