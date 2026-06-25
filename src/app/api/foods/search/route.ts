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

// Words that indicate a "plain"/default preparation — these get ranked
// above more specific preparations (boiled, canned, dehydrated, fried,
// mashed, etc.) when the search query itself doesn't ask for them.
const PLAIN_PREPARATION_WORDS = ["raw", "whole", "fresh"];

// Words that indicate extra processing/preparation complexity. Each one
// found in a name (beyond what the query itself mentions) pushes that
// result further down the list, since a bare "carrots" search shouldn't
// surface "carrots, dehydrated" above "carrots, raw".
const PROCESSING_QUALIFIER_WORDS = [
  "cooked",
  "boiled",
  "steamed",
  "canned",
  "dehydrated",
  "dried",
  "frozen",
  "fried",
  "roasted",
  "baked",
  "mashed",
  "pickled",
  "creamed",
  "scalloped",
  "candied",
  "glazed",
  "juice",
  "puree",
  "powder",
  "flour",
  "starch",
  "chips",
  "flakes",
  "with",
  "added",
  "fortified",
  "enriched",
];

/**
 * Scores how closely a food name matches the search query, lower is better.
 * USDA's own result ordering isn't reliably relevance-sorted, so we re-rank
 * ourselves with two layers:
 *   1. How closely the name matches the query text (exact > starts-with > contains)
 *   2. Whether the query itself asked for a specific preparation (if so, that
 *      preparation is preferred; otherwise plain/raw is preferred, and
 *      "cooked"/"boiled"/etc are penalized)
 *
 * Note: we deliberately do NOT penalize based on how many comma-separated
 * clauses a name has. USDA's naming convention bundles legitimate detail
 * (grain length, raw/cooked, enrichment) into the name itself, so the
 * correct plain answer (e.g. "Rice, white, long-grain, regular, raw,
 * unenriched") often has MORE clauses than an irrelevant one — clause
 * count is not a reliable signal for "plainness" and penalizing it
 * previously buried correct answers under their own normal level of detail.
 */
function relevanceScore(name: string, query: string): number {
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();

  let textMatchScore: number;
  if (lowerName === lowerQuery) textMatchScore = 0;
  else if (lowerName.startsWith(lowerQuery) || lowerName.startsWith(`${lowerQuery},`)) textMatchScore = 1;
  else if (new RegExp(`\\b${lowerQuery}\\b`).test(lowerName)) textMatchScore = 2;
  else textMatchScore = 3;

  // Did the query itself mention a specific preparation? If so, don't
  // penalize the name for having it — the person asked for it.
  const queryMentionsProcessing = PROCESSING_QUALIFIER_WORDS.some((w) => lowerQuery.includes(w));

  let preparationPenalty = 0;
  if (!queryMentionsProcessing) {
    const processingWordCount = PROCESSING_QUALIFIER_WORDS.filter((w) =>
      new RegExp(`\\b${w}\\b`).test(lowerName)
    ).length;
    preparationPenalty += processingWordCount;

    // Slight bonus (negative penalty) for explicitly plain/raw entries.
    const isPlain = PLAIN_PREPARATION_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(lowerName));
    if (isPlain) preparationPenalty -= 1;
  }

  return textMatchScore * 100 + preparationPenalty * 10 + lowerName.length / 1000;
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
  const { data: personalRaw, error: personalError } = await supabase
    .from("foods")
    .select("*")
    .ilike("name", `%${query}%`)
    .or(`owner_id.eq.${user.id},visibility.eq.shared,owner_id.is.null`)
    .limit(60);

  if (personalError) {
    return NextResponse.json({ error: personalError.message }, { status: 500 });
  }

  // Exclude any cached entry with a brand attached (covers leftover USDA
  // branded-product cache rows from before this filter existed). Your own
  // custom foods are never excluded, even if you happened to fill in a
  // brand field for one.
  const personalFiltered = (personalRaw ?? []).filter(
    (f) => f.source === "custom" || !f.brand
  );

  const personal = personalFiltered
    .sort((a, b) => relevanceScore(a.name, query) - relevanceScore(b.name, query))
    .slice(0, 5);

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
            pageSize: 50,
            dataType: ["Foundation", "SR Legacy"],
          }),
        }
      );

      if (usdaRes.ok) {
        const data = await usdaRes.json();
        const foods: UsdaFood[] = data.foods ?? [];

        usdaResults = foods
          .filter((f) => !f.brandOwner) // belt-and-suspenders: drop anything with a brand owner, regardless of dataType
          .map((f) => ({
            fdcId: f.fdcId,
            name: f.description,
            brand: f.brandOwner ?? null,
            caloriesPer100: extractNutrient(f, NUTRIENT_NUMBERS.calories),
            proteinPer100: extractNutrient(f, NUTRIENT_NUMBERS.protein),
            carbsPer100: extractNutrient(f, NUTRIENT_NUMBERS.carbs),
            fatPer100: extractNutrient(f, NUTRIENT_NUMBERS.fat),
          }))
          .sort((a, b) => relevanceScore(a.name, query) - relevanceScore(b.name, query))
          .slice(0, 5);
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
