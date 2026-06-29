import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// USDA nutrient numbers we care about.
const NUTRIENT_NUMBERS = {
  calories: "208",
  protein: "203",
  fat: "204",
  carbs: "205",
  fiber: "291",
} as const;

interface UsdaFoodNutrient {
  nutrient?: { number?: string | number; name?: string };
  nutrientId?: number;
  amount?: number;
}

function extractNutrientFromDetail(nutrients: UsdaFoodNutrient[], nutrientNumber: string): number {
  const match = nutrients.find((n) => String(n.nutrient?.number) === nutrientNumber);
  return match?.amount ?? 0;
}

/**
 * One-time backfill: re-fetches full nutrient detail from USDA for every
 * cached USDA food with fiber_g_per_100 = 0, since those rows were likely
 * cached before fiber extraction existed. Uses the food detail endpoint
 * (not search) since it reliably returns the complete nutrient list.
 *
 * This is an admin/maintenance route, not meant for regular app use —
 * it can be removed once the backfill has been run.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "USDA API key not configured" }, { status: 500 });
  }

  const { data: candidates, error } = await supabase
    .from("foods")
    .select("id, name, usda_fdc_id")
    .eq("source", "usda")
    .eq("fiber_g_per_100", 0)
    .not("usda_fdc_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ name: string; updated: boolean; fiber?: number; reason?: string }> = [];

  for (const food of candidates ?? []) {
    try {
      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/food/${food.usda_fdc_id}?api_key=${apiKey}`
      );
      if (!res.ok) {
        results.push({ name: food.name, updated: false, reason: `USDA fetch failed (${res.status})` });
        continue;
      }

      const detail = await res.json();
      const nutrients: UsdaFoodNutrient[] = detail.foodNutrients ?? [];

      const fiber = extractNutrientFromDetail(nutrients, NUTRIENT_NUMBERS.fiber);
      const calories = extractNutrientFromDetail(nutrients, NUTRIENT_NUMBERS.calories);
      const protein = extractNutrientFromDetail(nutrients, NUTRIENT_NUMBERS.protein);
      const carbs = extractNutrientFromDetail(nutrients, NUTRIENT_NUMBERS.carbs);
      const fat = extractNutrientFromDetail(nutrients, NUTRIENT_NUMBERS.fat);

      // Only update fiber — leave the other macros alone since they were
      // presumably already correct (calories/protein/fat/carbs worked
      // from day one). This avoids accidentally overwriting anything.
      const { error: updateError } = await supabase
        .from("foods")
        .update({ fiber_g_per_100: fiber, updated_at: new Date().toISOString() })
        .eq("id", food.id);

      if (updateError) {
        results.push({ name: food.name, updated: false, reason: updateError.message });
      } else {
        results.push({ name: food.name, updated: true, fiber });
      }

      // Be polite to USDA's API — small delay between requests.
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (err) {
      results.push({
        name: food.name,
        updated: false,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    totalCandidates: candidates?.length ?? 0,
    results,
  });
}

/**
 * After backfilling raw USDA foods, recalculate fiber for every composite
 * food (recipe), since their fiber_g_per_100 was a snapshot taken at
 * creation time using whatever component fiber values existed then.
 */
export async function PATCH() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: composites, error } = await supabase
    .from("foods")
    .select("id, name")
    .eq("is_composite", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ name: string; updated: boolean; fiber?: number; reason?: string }> = [];

  for (const composite of composites ?? []) {
    const { data: items, error: itemsError } = await supabase
      .from("composite_food_items")
      .select("grams_equivalent, component:foods!component_food_id(fiber_g_per_100)")
      .eq("composite_food_id", composite.id);

    if (itemsError || !items) {
      results.push({ name: composite.name, updated: false, reason: itemsError?.message ?? "No items" });
      continue;
    }

    let totalFiber = 0;
    let totalGrams = 0;
    for (const item of items) {
      const componentFiber = (item.component as unknown as { fiber_g_per_100: number })?.fiber_g_per_100 ?? 0;
      const factor = item.grams_equivalent / 100;
      totalFiber += componentFiber * factor;
      totalGrams += item.grams_equivalent;
    }

    const fiberPer100 = totalGrams > 0 ? (totalFiber * 100) / totalGrams : 0;

    const { error: updateError } = await supabase
      .from("foods")
      .update({ fiber_g_per_100: fiberPer100, updated_at: new Date().toISOString() })
      .eq("id", composite.id);

    if (updateError) {
      results.push({ name: composite.name, updated: false, reason: updateError.message });
    } else {
      results.push({ name: composite.name, updated: true, fiber: fiberPer100 });
    }
  }

  return NextResponse.json({ results });
}
