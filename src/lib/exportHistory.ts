"use client";

import * as XLSX from "xlsx";
import type { LogEntryWithFood } from "@/lib/types";

interface DayTotal {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

const mealLabels: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export function exportHistoryToSpreadsheet(
  days: DayTotal[],
  logs: LogEntryWithFood[],
  rangeLabel: string
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: daily totals
  const totalsRows = days.map((d) => ({
    Date: d.date,
    "Calories (kcal)": Math.round(d.calories),
    "Protein (g)": Math.round(d.protein),
    "Carbs (g)": Math.round(d.carbs),
    "Fat (g)": Math.round(d.fat),
    "Fiber (g)": Math.round(d.fiber),
  }));
  const totalsSheet = XLSX.utils.json_to_sheet(totalsRows);
  totalsSheet["!cols"] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, totalsSheet, "Daily Totals");

  // Sheet 2: full per-entry detail
  const detailRows = logs.map((log) => {
    const logged = new Date(log.logged_at);
    return {
      Date: logged.toLocaleDateString(),
      Time: logged.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      Meal: mealLabels[log.meal_type] ?? log.meal_type,
      Food: log.food.name,
      Quantity: log.quantity,
      Unit: log.unit,
      "Calories (kcal)": Math.round(log.calories),
      "Protein (g)": Math.round(log.protein_g),
      "Carbs (g)": Math.round(log.carbs_g),
      "Fat (g)": Math.round(log.fat_g),
      "Fiber (g)": Math.round(log.fiber_g),
      "Logged via": log.source,
    };
  });
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  detailSheet["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 28 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 9 },
    { wch: 9 },
    { wch: 11 },
  ];
  XLSX.utils.book_append_sheet(wb, detailSheet, "Full Detail");

  XLSX.writeFile(wb, `food-log-${rangeLabel}.xlsx`);
}
