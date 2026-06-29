"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [targetCalories, setTargetCalories] = useState<string>("");
  const [targetProtein, setTargetProtein] = useState<string>("");
  const [targetCarbs, setTargetCarbs] = useState<string>("");
  const [targetFat, setTargetFat] = useState<string>("");
  const [targetFiber, setTargetFiber] = useState<string>("");

  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name ?? "");
        setTargetCalories(data.target_calories?.toString() ?? "");
        setTargetProtein(data.target_protein_g?.toString() ?? "");
        setTargetCarbs(data.target_carbs_g?.toString() ?? "");
        setTargetFat(data.target_fat_g?.toString() ?? "");
        setTargetFiber(data.target_fiber_g?.toString() ?? "");
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedMessage(false);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        targetCalories: targetCalories === "" ? null : Number(targetCalories),
        targetProteinG: targetProtein === "" ? null : Number(targetProtein),
        targetCarbsG: targetCarbs === "" ? null : Number(targetCarbs),
        targetFatG: targetFat === "" ? null : Number(targetFat),
        targetFiberG: targetFiber === "" ? null : Number(targetFiber),
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2000);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleResetHistory() {
    setResetting(true);
    setResetError(null);
    setResetMessage(null);

    const res = await fetch("/api/logs/reset", { method: "DELETE" });
    const data = await res.json();

    setResetting(false);

    if (data.error) {
      setResetError(data.error);
      return;
    }

    setResetConfirmText("");
    setResetMessage(`Cleared ${data.deletedCount} log entr${data.deletedCount === 1 ? "y" : "ies"}.`);
  }

  async function handleReplayTour() {
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hasSeenTour: false }),
    });
    router.push("/");
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 pt-6">
        <p className="text-center text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={() => router.push("/")} className="text-sm font-medium text-emerald-600">
        ← Back
      </button>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Profile &amp; targets</h1>

      <div className="mt-5">
        <label className="block text-sm font-medium text-neutral-700">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-700">Daily targets</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Leave any field blank if you don&rsquo;t want to track a target for it — the dashboard
          will just show your totals with no progress bar.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Calories (kcal)</label>
            <input
              type="number"
              value={targetCalories}
              onChange={(e) => setTargetCalories(e.target.value)}
              placeholder="e.g. 2200"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Protein (g)</label>
            <input
              type="number"
              value={targetProtein}
              onChange={(e) => setTargetProtein(e.target.value)}
              placeholder="e.g. 150"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Carbs (g)</label>
            <input
              type="number"
              value={targetCarbs}
              onChange={(e) => setTargetCarbs(e.target.value)}
              placeholder="e.g. 200"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Fat (g)</label>
            <input
              type="number"
              value={targetFat}
              onChange={(e) => setTargetFat(e.target.value)}
              placeholder="e.g. 70"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Fiber (g)</label>
            <input
              type="number"
              value={targetFiber}
              onChange={(e) => setTargetFiber(e.target.value)}
              placeholder="e.g. 30"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {savedMessage && <p className="mt-4 text-sm text-emerald-600">Saved.</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-6 w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>

      <button
        onClick={handleReplayTour}
        className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-3 text-sm font-medium text-neutral-600 transition hover:border-emerald-200 hover:text-emerald-700"
      >
        Replay app tour
      </button>

      <button
        onClick={handleLogout}
        className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-3 text-sm font-medium text-neutral-600 transition hover:border-red-200 hover:text-red-600"
      >
        Log out
      </button>

      <div className="mt-10 rounded-xl border border-red-100 bg-red-50/50 p-4">
        <h2 className="text-sm font-semibold text-red-700">Delete history</h2>
        <p className="mt-1 text-xs text-red-600">
          This action permanently deletes all food log history.
        </p>

        <label className="mt-3 block text-xs font-medium text-red-700">
          Type RESET to confirm
        </label>
        <input
          type="text"
          value={resetConfirmText}
          onChange={(e) => setResetConfirmText(e.target.value)}
          className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
        />

        {resetError && <p className="mt-2 text-xs text-red-700">{resetError}</p>}
        {resetMessage && <p className="mt-2 text-xs text-emerald-700">{resetMessage}</p>}

        <button
          onClick={handleResetHistory}
          disabled={resetConfirmText !== "RESET" || resetting}
          className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-40"
        >
          {resetting ? "Clearing history…" : "Reset all history"}
        </button>
      </div>
    </div>
  );
}
