import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "start and end dates are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rangeStart = new Date(`${startDate}T00:00:00`);
  const rangeEnd = new Date(`${endDate}T00:00:00`);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  const { data: logsRaw, error } = await supabase
    .from("logs")
    .select("*, food:foods(id, name, brand)")
    .eq("user_id", user.id)
    .gte("logged_at", rangeStart.toISOString())
    .lt("logged_at", rangeEnd.toISOString())
    .order("logged_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const logs = logsRaw ?? [];

  // Daily totals, same grouping logic as /api/history.
  const dayTotals = new Map<
    string,
    { calories: number; protein: number; carbs: number; fat: number; fiber: number }
  >();

  for (const log of logs) {
    const date = new Date(log.logged_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
    const existing = dayTotals.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    existing.calories += log.calories;
    existing.protein += log.protein_g;
    existing.carbs += log.carbs_g;
    existing.fat += log.fat_g;
    existing.fiber += log.fiber_g;
    dayTotals.set(key, existing);
  }

  const days = Array.from(dayTotals.entries())
    .map(([date, totals]) => ({ date, ...totals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ days, logs });
}
