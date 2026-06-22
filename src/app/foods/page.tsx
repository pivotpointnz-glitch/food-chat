"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Food } from "@/lib/types";

export default function MyFoodsPage() {
  const router = useRouter();
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/foods/mine")
      .then((res) => res.json())
      .then((data) => setFoods(data.foods ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);

    const res = await fetch(`/api/foods/${id}`, { method: "DELETE" });
    const data = await res.json();

    setDeletingId(null);
    setConfirmingId(null);

    if (data.error) {
      setError(data.error);
      return;
    }

    setFoods((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={() => router.back()} className="text-sm font-medium text-emerald-600">
        ← Back
      </button>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">My foods</h1>
        <button
          onClick={() => router.push("/foods/new")}
          className="text-sm font-medium text-emerald-600"
        >
          + New
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="mt-6 text-center text-sm text-neutral-400">Loading…</p>
      ) : foods.length === 0 ? (
        <p className="mt-6 text-center text-sm text-neutral-400">
          You haven&rsquo;t created any custom foods yet.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white">
          {foods.map((food) => (
            <div key={food.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {food.name}
                  {food.is_composite && <span className="ml-1 text-emerald-600">★</span>}
                  {food.visibility === "shared" && (
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                      shared
                    </span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">
                  {Math.round(food.calories_per_100)} kcal / 100{food.base_unit}
                </p>
              </div>

              {confirmingId === food.id ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(food.id)}
                    disabled={deletingId === food.id}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {deletingId === food.id ? "Deleting…" : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingId(food.id)}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:border-red-200 hover:text-red-600"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
