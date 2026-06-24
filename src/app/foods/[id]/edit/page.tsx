"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { FoodForm, type FoodFormPayload, type FoodFormInitialData } from "@/components/FoodForm";
import { toGramsEquivalent } from "@/lib/units";
import type { Food } from "@/lib/types";

interface ComponentApiRow {
  food: Food;
  quantity: number;
  unit: string;
  grams_equivalent: number;
}

export default function EditFoodPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [initialData, setInitialData] = useState<FoodFormInitialData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/foods/${params.id}/update`);
      const data = await res.json();

      if (data.error) {
        setLoadError(data.error);
        return;
      }

      const food = data.food as Food;
      const componentRows: ComponentApiRow[] = data.components ?? [];

      setInitialData({
        mode: food.is_composite ? "composite" : "simple",
        name: food.name,
        visibility: food.visibility,
        defaultUnit: food.default_unit,
        defaultQuantity: food.default_quantity,
        calories: food.calories_per_100,
        protein: food.protein_g_per_100,
        carbs: food.carbs_g_per_100,
        fat: food.fat_g_per_100,
        components: componentRows.map((c) => ({
          food: c.food,
          quantity: c.quantity,
          unit: c.unit,
          gramsPerEach: null,
          gramsEquivalent: c.grams_equivalent ?? toGramsEquivalent(c.quantity, c.unit, null),
        })),
      });
    }
    load();
  }, [params.id]);

  async function handleSave(payload: FoodFormPayload) {
    const res = await fetch(`/api/foods/${params.id}/update`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 pt-6">
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 pt-6">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  return (
    <FoodForm
      title="Edit food"
      initialData={initialData}
      saveLabel="Save changes"
      onSave={handleSave}
      onSaved={() => router.push("/foods")}
    />
  );
}
