"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { LogRow } from "@/components/LogRow";
import { exportHistoryToSpreadsheet } from "@/lib/exportHistory";
import type { LogEntryWithFood, Profile } from "@/lib/types";

type Tab = "day" | "week" | "month";
type MacroKey = "calories" | "protein" | "carbs" | "fat" | "fiber";

interface DayTotal {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const MACRO_CONFIG: Record<
  MacroKey,
  { label: string; unit: string; color: string; targetKey: keyof Profile }
> = {
  calories: { label: "Calories", unit: "kcal", color: "#059669", targetKey: "target_calories" },
  protein: { label: "Protein", unit: "g", color: "#3b82f6", targetKey: "target_protein_g" },
  carbs: { label: "Carbs", unit: "g", color: "#f59e0b", targetKey: "target_carbs_g" },
  fat: { label: "Fat", unit: "g", color: "#fb7185", targetKey: "target_fat_g" },
  fiber: { label: "Fiber", unit: "g", color: "#84cc16", targetKey: "target_fiber_g" },
};

export default function HistoryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("day");
  const [selectedMacro, setSelectedMacro] = useState<MacroKey>("calories");
  const [profile, setProfile] = useState<Profile | null>(null);

  // Day view state
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
  const [dayLogs, setDayLogs] = useState<LogEntryWithFood[]>([]);
  const [dayTotals, setDayTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const [dayLoading, setDayLoading] = useState(false);

  // Week/month view state
  const [rangeDays, setRangeDays] = useState<DayTotal[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (data) setProfile(data);
    }
    loadProfile();
  }, []);

  const loadDay = useCallback(async (date: string) => {
    setDayLoading(true);
    const res = await fetch(`/api/history/day?date=${date}`);
    const data = await res.json();
    setDayLogs(data.logs ?? []);
    setDayTotals(data.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    setDayLoading(false);
  }, []);

  const loadRange = useCallback(async (rangeTab: "week" | "month") => {
    setRangeLoading(true);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (rangeTab === "week" ? 6 : 29));

    const res = await fetch(`/api/history?start=${toDateString(start)}&end=${toDateString(end)}`);
    const data = await res.json();

    // Fill in missing days as zero, so the chart/table shows a continuous range.
    const byDate = new Map<string, DayTotal>((data.days ?? []).map((d: DayTotal) => [d.date, d]));
    const filled: DayTotal[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = toDateString(cursor);
      filled.push(byDate.get(key) ?? { date: key, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    setRangeDays(filled);
    setRangeLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "day") loadDay(selectedDate);
    else loadRange(tab);
  }, [tab, selectedDate, loadDay, loadRange]);

  const rangeAvg = rangeDays.length
    ? {
        calories: rangeDays.reduce((s, d) => s + d.calories, 0) / rangeDays.length,
        protein: rangeDays.reduce((s, d) => s + d.protein, 0) / rangeDays.length,
        carbs: rangeDays.reduce((s, d) => s + d.carbs, 0) / rangeDays.length,
        fat: rangeDays.reduce((s, d) => s + d.fat, 0) / rangeDays.length,
        fiber: rangeDays.reduce((s, d) => s + d.fiber, 0) / rangeDays.length,
      }
    : null;

  async function handleExport() {
    setExporting(true);
    try {
      let start: string;
      let end: string;

      if (tab === "day") {
        start = selectedDate;
        end = selectedDate;
      } else {
        end = toDateString(new Date());
        const startD = new Date();
        startD.setDate(startD.getDate() - (tab === "week" ? 6 : 29));
        start = toDateString(startD);
      }

      const res = await fetch(`/api/history/export?start=${start}&end=${end}`);
      const data = await res.json();

      exportHistoryToSpreadsheet(
        data.days ?? [],
        (data.logs ?? []) as LogEntryWithFood[],
        `${start}_to_${end}`
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={() => router.push("/")} className="text-sm font-medium text-emerald-600">
        ← Back
      </button>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">History</h1>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {(["day", "week", "month"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                : "border-neutral-200 text-neutral-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <button
        onClick={handleExport}
        disabled={exporting}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50"
      >
        {exporting ? "Preparing download…" : `⬇ Download ${tab} as spreadsheet`}
      </button>

      {tab === "day" && (
        <div className="mt-5">
          <input
            type="date"
            value={selectedDate}
            max={toDateString(new Date())}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />

          {dayLoading ? (
            <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-5 gap-2 rounded-xl bg-neutral-50 p-3 text-center">
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(dayTotals.calories)}
                  </p>
                  <p className="text-xs text-neutral-500">kcal</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(dayTotals.protein)}
                  </p>
                  <p className="text-xs text-neutral-500">protein</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(dayTotals.carbs)}
                  </p>
                  <p className="text-xs text-neutral-500">carbs</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(dayTotals.fat)}
                  </p>
                  <p className="text-xs text-neutral-500">fat</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-neutral-900">
                    {Math.round(dayTotals.fiber)}
                  </p>
                  <p className="text-xs text-neutral-500">fiber</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-neutral-100 bg-white px-4 shadow-sm">
                {dayLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-400">
                    Nothing logged this day.
                  </p>
                ) : (
                  dayLogs.map((log) => <LogRow key={log.id} log={log} />)
                )}
              </div>
            </>
          )}
        </div>
      )}

      {(tab === "week" || tab === "month") && (
        <div className="mt-5">
          {rangeLoading ? (
            <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
          ) : (
            <>
              {rangeAvg && (
                <div className="grid grid-cols-5 gap-2 rounded-xl bg-neutral-50 p-3 text-center">
                  <div>
                    <p className="text-base font-semibold text-neutral-900">
                      {Math.round(rangeAvg.calories)}
                    </p>
                    <p className="text-xs text-neutral-500">avg kcal</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-neutral-900">
                      {Math.round(rangeAvg.protein)}
                    </p>
                    <p className="text-xs text-neutral-500">avg protein</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-neutral-900">
                      {Math.round(rangeAvg.carbs)}
                    </p>
                    <p className="text-xs text-neutral-500">avg carbs</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-neutral-900">
                      {Math.round(rangeAvg.fat)}
                    </p>
                    <p className="text-xs text-neutral-500">avg fat</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-neutral-900">
                      {Math.round(rangeAvg.fiber)}
                    </p>
                    <p className="text-xs text-neutral-500">avg fiber</p>
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
                {(Object.keys(MACRO_CONFIG) as MacroKey[]).map((key) => {
                  const config = MACRO_CONFIG[key];
                  const isActive = selectedMacro === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedMacro(key)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "border-transparent text-white"
                          : "border-neutral-200 text-neutral-600"
                      }`}
                      style={isActive ? { backgroundColor: config.color } : undefined}
                    >
                      {config.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 h-56 rounded-2xl border border-neutral-100 bg-white p-2 shadow-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rangeDays} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(d) => formatDisplayDate(d).split(" ")[0]}
                      interval={tab === "month" ? 4 : 0}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={36} />
                    <Tooltip
                      labelFormatter={(d) => formatDisplayDate(d as string)}
                      formatter={(value) => [
                        `${Math.round(Number(value) || 0)} ${MACRO_CONFIG[selectedMacro].unit}`,
                        MACRO_CONFIG[selectedMacro].label,
                      ]}
                    />
                    {profile && (profile[MACRO_CONFIG[selectedMacro].targetKey] as number | null) && (
                      <ReferenceLine
                        y={profile[MACRO_CONFIG[selectedMacro].targetKey] as number}
                        stroke="#a3a3a3"
                        strokeDasharray="4 4"
                        label={{
                          value: "Target",
                          position: "insideTopRight",
                          fontSize: 10,
                          fill: "#a3a3a3",
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey={selectedMacro}
                      stroke={MACRO_CONFIG[selectedMacro].color}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-center text-[11px] text-neutral-400">
                {MACRO_CONFIG[selectedMacro].label} ({MACRO_CONFIG[selectedMacro].unit}) per day
              </p>

              <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-left text-xs text-neutral-400">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 text-right font-medium">Kcal</th>
                      <th className="px-3 py-2 text-right font-medium">P</th>
                      <th className="px-3 py-2 text-right font-medium">C</th>
                      <th className="px-3 py-2 text-right font-medium">F</th>
                      <th className="px-3 py-2 text-right font-medium">Fb</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rangeDays
                      .slice()
                      .reverse()
                      .map((d) => (
                        <tr key={d.date} className="border-b border-neutral-50 last:border-0">
                          <td className="px-3 py-2 text-neutral-700">{formatDisplayDate(d.date)}</td>
                          <td className="px-3 py-2 text-right text-neutral-700">
                            {Math.round(d.calories)}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-500">
                            {Math.round(d.protein)}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-500">
                            {Math.round(d.carbs)}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-500">
                            {Math.round(d.fat)}
                          </td>
                          <td className="px-3 py-2 text-right text-neutral-500">
                            {Math.round(d.fiber)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
