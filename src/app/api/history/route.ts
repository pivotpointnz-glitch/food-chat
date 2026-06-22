import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start"); // YYYY-MM-DD
  const endDate = searchParams.get("end"); // YYYY-MM-DD

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "start and end dates are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use the start of startDate and the start of the day *after* endDate so
  // the range is inclusive of the entire end date, regardless of timezone
  // edge cases with raw ISO timestamp comparison.
  const rangeStart = new Date(`${startDate}T00:00:00`);
  const rangeEnd = new Date(`${endDate}T00:00:00`);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  const { data: logs, error } = await supabase
    .from("logs")
    .select("logged_at, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", user.id)
    .gte("logged_at", rangeStart.toISOString())
    .lt("logged_at", rangeEnd.toISOString())
    .order("logged_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group into per-day totals, keyed by local YYYY-MM-DD.
  const dayTotals = new Map<
    string,
    { calories: number; protein: number; carbs: number; fat: number }
  >();

  for (const log of logs ?? []) {
    const date = new Date(log.logged_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;

    const existing = dayTotals.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    existing.calories += log.calories;
    existing.protein += log.protein_g;
    existing.carbs += log.carbs_g;
    existing.fat += log.fat_g;
    dayTotals.set(key, existing);
  }

  const days = Array.from(dayTotals.entries())
    .map(([date, totals]) => ({ date, ...totals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ days });
}
