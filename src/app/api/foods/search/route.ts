import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// USDA nutrient numbers we care about.
// 208 = Energy (kcal), 203 = Protein, 204 = Total fat, 205 = Carbohydrate, by difference
const NUTRIENT_NUMBERS = {
  calories: "208",
  protein: "203",
  fat: "204",
  carbs: "205",
} as const;

interface UsdaFoodNutrient {
  nutrientNumber?: string;
  number?: string;
  value?: number;
  amount?: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType?: string;
  foodNutrients: UsdaFoodNutrient[];
}

function extractNutrient(food: UsdaFood, nutrientNumber: string): number {
  const match = food.foodNutrients.find(
    (n) => (n.nutrientNumber ?? n.number) === nutrientNumber
  );
  return match?.value ?? match?.amount ?? 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ personal: [], usda: [] });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Search personal + shared + already-cached USDA foods in our own DB first.
  const { data: personal, error: personalError } = await supabase
    .from("foods")
    .select("*")
    .ilike("name", `%${query}%`)
    .or(`owner_id.eq.${user.id},visibility.eq.shared,owner_id.is.null`)
    .limit(15);

  if (personalError) {
    return NextResponse.json({ error: personalError.message }, { status: 500 });
  }

  // 2. Query USDA live for anything not already cached. We still show these
  // as separate "USDA" results; selecting one will cache it into `foods`.
  const apiKey = process.env.USDA_FDC_API_KEY;
  let usdaResults: Array<{
    fdcId: number;
    name: string;
    brand: string | null;
    caloriesPer100: number;
    proteinPer100: number;
    carbsPer100: number;
    fatPer100: number;
  }> = [];

  if (apiKey) {
    try {
      const usdaRes = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            pageSize: 15,
            dataType: ["Foundation", "SR Legacy"],
          }),
        }
      );

      if (usdaRes.ok) {
        const data = await usdaRes.json();
        const foods: UsdaFood[] = data.foods ?? [];

        usdaResults = foods.map((f) => ({
          fdcId: f.fdcId,
          name: f.description,
          brand: f.brandOwner ?? null,
          caloriesPer100: extractNutrient(f, NUTRIENT_NUMBERS.calories),
          proteinPer100: extractNutrient(f, NUTRIENT_NUMBERS.protein),
          carbsPer100: extractNutrient(f, NUTRIENT_NUMBERS.carbs),
          fatPer100: extractNutrient(f, NUTRIENT_NUMBERS.fat),
        }));
      }
    } catch {
      // USDA being unreachable shouldn't break personal-library search.
    }
  }

  // Don't show USDA results we already have cached (dedupe by fdc_id).
  const cachedFdcIds = new Set((personal ?? []).map((f) => f.usda_fdc_id).filter(Boolean));
  const usda = usdaResults.filter((f) => !cachedFdcIds.has(String(f.fdcId)));

  return NextResponse.json({ personal: personal ?? [], usda });
}
