import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MacroProgress } from "@/components/MacroProgress";
import { LogRow } from "@/components/LogRow";
import type { LogEntryWithFood, Profile } from "@/lib/types";

function startOfTodayISO() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export default async function HomePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const { data: logsRaw } = await supabase
    .from("logs")
    .select("*, food:foods(id, name, brand)")
    .eq("user_id", user.id)
    .gte("logged_at", startOfTodayISO())
    .order("logged_at", { ascending: false });

  const logs = (logsRaw ?? []) as unknown as LogEntryWithFood[];

  const totals = logs.reduce(
    (acc, log) => ({
      calories: acc.calories + log.calories,
      protein: acc.protein + log.protein_g,
      carbs: acc.carbs + log.carbs_g,
      fat: acc.fat + log.fat_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500">Today</p>
          <h1 className="text-xl font-semibold text-neutral-900">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/foods" className="text-sm font-medium text-neutral-500">
            My foods
          </Link>
          <Link
            href="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-700"
          >
            {profile?.display_name?.[0]?.toUpperCase() ?? "?"}
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
        <MacroProgress
          label="Calories"
          current={totals.calories}
          target={profile?.target_calories ?? null}
          unit="kcal"
          colorClass="bg-emerald-500"
        />
        <MacroProgress
          label="Protein"
          current={totals.protein}
          target={profile?.target_protein_g ?? null}
          unit="g"
          colorClass="bg-blue-500"
        />
        <MacroProgress
          label="Carbs"
          current={totals.carbs}
          target={profile?.target_carbs_g ?? null}
          unit="g"
          colorClass="bg-amber-500"
        />
        <MacroProgress
          label="Fat"
          current={totals.fat}
          target={profile?.target_fat_g ?? null}
          unit="g"
          colorClass="bg-rose-400"
        />
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-700">Today&rsquo;s log</h2>
        <div className="mt-2 rounded-2xl border border-neutral-100 bg-white px-4 shadow-sm">
          {logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">
              Nothing logged yet today.
            </p>
          ) : (
            logs.map((log) => <LogRow key={log.id} log={log} />)
          )}
        </div>
      </div>

      <Link
        href="/log/new"
        className="fixed bottom-6 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white shadow-lg transition hover:bg-emerald-700"
        aria-label="Log food"
      >
        +
      </Link>
    </div>
  );
}
