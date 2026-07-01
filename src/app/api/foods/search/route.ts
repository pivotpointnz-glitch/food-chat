import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// USDA nutrient numbers we care about.
// 208 = Energy (kcal), 203 = Protein, 204 = Total fat, 205 = Carbohydrate by difference, 291 = Fiber, total dietary
const NUTRIENT_NUMBERS = {
  calories: "208",
  protein: "203",
  fat: "204",
  carbs: "205",
  fiber: "291",
} as const;

interface UsdaFoodNutrient {
  nutrientNumber?: string | number;
  number?: string | number;
  nutrientId?: string | number;
  value?: number;
  amount?: number;
  nutrient?: {
    number?: string | number;
    id?: string | number;
    name?: string;
  };
  nutrientName?: string;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType?: string;
  foodNutrients: UsdaFoodNutrient[];
}

// USDA's nutrient name as a fallback match, since the numeric "nutrient
// number" field has shown up in different shapes (flat vs nested under
// `nutrient.number`) across endpoints/data types, and isn't always present
// or consistently typed (string vs number). Matching by name as a backup
// makes extraction robust regardless of which shape a given result uses.
const NUTRIENT_NAME_FALLBACKS: Record<string, string[]> = {
  "208": ["energy"],
  "203": ["protein"],
  "204": ["total lipid (fat)", "total fat"],
  "205": ["carbohydrate, by difference", "carbohydrate"],
  "291": ["fiber, total dietary", "dietary fiber", "fiber"],
};

function extractNutrient(food: UsdaFood, nutrientNumber: string): number {
  const match = food.foodNutrients.find((n) => {
    const flatNumber = n.nutrientNumber ?? n.number ?? n.nutrientId;
    const nestedNumber = n.nutrient?.number ?? n.nutrient?.id;
    if (flatNumber !== undefined && String(flatNumber) === nutrientNumber) return true;
    if (nestedNumber !== undefined && String(nestedNumber) === nutrientNumber) return true;
    return false;
  });

  if (match) {
    return match.value ?? match.amount ?? 0;
  }

  // Fallback: match by nutrient name (case-insensitive), in case the
  // numeric identifier wasn't present or didn't match for this result.
  const nameOptions = NUTRIENT_NAME_FALLBACKS[nutrientNumber];
  if (nameOptions) {
    const nameMatch = food.foodNutrients.find((n) => {
      const name = (n.nutrientName ?? n.nutrient?.name ?? "").toLowerCase();
      return nameOptions.some((opt) => name === opt || name.includes(opt));
    });
    if (nameMatch) {
      return nameMatch.value ?? nameMatch.amount ?? 0;
    }
  }

  return 0;
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
  const clauses = lowerName.split(",").map((c) => c.trim());
  const firstClause = clauses[0] ?? "";
  // USDA often splits a food's core identity and its primary descriptor
  // across the first two clauses (e.g. "Rice, brown, long-grain, raw" —
  // "rice" and "brown" are separate clauses). Treat the first two
  // combined as the food's "primary identity" for matching purposes.
  const primaryIdentity = clauses.slice(0, 2).join(" ");
  const queryWords = lowerQuery.split(/\s+/).filter(Boolean);

  const wordInName = (w: string, text: string) => new RegExp(`\\b${w}\\b`).test(text);
  const allWordsInPrimaryIdentity = queryWords.every((w) => wordInName(w, primaryIdentity));
  const allWordsInName = queryWords.every((w) => wordInName(w, lowerName));

  let textMatchScore: number;
  if (lowerName === lowerQuery) textMatchScore = 0;
  else if (firstClause === lowerQuery) textMatchScore = 0.5;
  else if (lowerName.startsWith(lowerQuery) || lowerName.startsWith(`${lowerQuery},`)) textMatchScore = 1;
  else if (new RegExp(`\\b${lowerQuery}\\b`).test(firstClause)) textMatchScore = 1.5;
  // All query words present within the food's primary identity (first two
  // clauses), regardless of order — this is what catches "brown rice"
  // matching "Rice, brown, ..." even though USDA splits the food and its
  // descriptor across separate clauses in reversed order from how people
  // naturally search.
  else if (queryWords.length > 1 && allWordsInPrimaryIdentity) textMatchScore = 2;
  else if (new RegExp(`\\b${lowerQuery}\\b`).test(lowerName)) textMatchScore = 4;
  else if (queryWords.length > 1 && allWordsInName) textMatchScore = 4.5;
  else textMatchScore = 5;

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

  // Fast food chains to exclude from NZ results — these are meal-level
  // entries (a Big Mac, a KFC burger) with no place in ingredient-based
  // tracking. NZ grocery brands (Weet-Bix, Anchor, Wattie's, etc.) are
  // kept since they're real products people buy and cook with.
  const FAST_FOOD_CHAINS = [
    "McDonald's",
    "Kentucky Fried Chicken",
    "KFC",
    "Pizza Hut",
    "Burger King",
    "Burger Fuel",
  ];
  const fastFoodPattern = new RegExp(
    FAST_FOOD_CHAINS.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "i"
  );

  // Exclude any cached entry with a brand attached (covers leftover USDA
  // branded-product cache rows from before this filter existed). Your own
  // custom foods are never excluded, even if you happened to fill in a
  // brand field for one.
  const personalFiltered = (personalRaw ?? []).filter(
    (f) => f.source === "custom" || f.source === "nz" || !f.brand
  );

  // Split into NZ database results and user's own custom foods separately,
  // since NZ foods act as our primary data source now.
  const nzResults = personalFiltered
    .filter((f) => f.source === "nz" && !fastFoodPattern.test(f.name))
    .sort((a, b) => relevanceScore(a.name, query) - relevanceScore(b.name, query))
    .slice(0, 5);

  const personal = personalFiltered
    .filter((f) => f.source !== "nz")
    .sort((a, b) => relevanceScore(a.name, query) - relevanceScore(b.name, query))
    .slice(0, 5);

  // Only call USDA live if NZ database returned fewer than 2 results —
  // meaning the food genuinely isn't in the NZ dataset (unusual ingredients,
  // very specific items, etc). This preserves USDA as a fallback without
  // cluttering results when NZ already has good matches.
  const nzHasSufficientResults = nzResults.length >= 2;

  // 2. Query USDA live for anything not already cached. We still show these
  // as separate "USDA" results; selecting one will cache it into `foods`.
  //
  // USDA's own search relevance can behave very differently for a single
  // word vs. a two-word phrase: a query like "brown rice" sometimes favors
  // names where the words sit close together (e.g. "rice cakes, brown
  // rice") over the canonical "Rice, brown, long-grain, raw" — because
  // USDA names things in "[food], [descriptor]" order, not "[descriptor]
  // [food]" order. To compensate, for two-word queries we also try the
  // words in reversed/comma order (USDA's natural convention) as a second
  // query, and merge results from both — this catches cases the direct
  // phrase search alone would miss.
  const apiKey = process.env.USDA_FDC_API_KEY;
  const queryVariants = [query];

  const words = query.trim().split(/\s+/);
  if (words.length === 2) {
    queryVariants.push(`${words[1]}, ${words[0]}`);
  }

  let usdaResults: Array<{
    fdcId: number;
    name: string;
    brand: string | null;
    caloriesPer100: number;
    proteinPer100: number;
    carbsPer100: number;
    fatPer100: number;
    fiberPer100: number;
  }> = [];

  if (apiKey && !nzHasSufficientResults) {
    try {
      const responses = await Promise.all(
        queryVariants.map((variant) =>
          fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: variant,
              pageSize: 200,
              dataType: ["Foundation", "SR Legacy"],
            }),
          }).then((r) => (r.ok ? r.json() : { foods: [] }))
        )
      );

      const seenFdcIds = new Set<number>();
      const allFoods: UsdaFood[] = [];
      for (const data of responses) {
        for (const f of (data.foods ?? []) as UsdaFood[]) {
          if (!seenFdcIds.has(f.fdcId)) {
            seenFdcIds.add(f.fdcId);
            allFoods.push(f);
          }
        }
      }

      usdaResults = allFoods
        .filter((f) => !f.brandOwner)
        .map((f) => ({
          fdcId: f.fdcId,
          name: f.description,
          brand: f.brandOwner ?? null,
          caloriesPer100: extractNutrient(f, NUTRIENT_NUMBERS.calories),
          proteinPer100: extractNutrient(f, NUTRIENT_NUMBERS.protein),
          carbsPer100: extractNutrient(f, NUTRIENT_NUMBERS.carbs),
          fatPer100: extractNutrient(f, NUTRIENT_NUMBERS.fat),
          fiberPer100: extractNutrient(f, NUTRIENT_NUMBERS.fiber),
          _nutrientCount: f.foodNutrients?.length ?? 0,
        }))
        .sort((a, b) => {
          const aIsEmpty = a.caloriesPer100 === 0;
          const bIsEmpty = b.caloriesPer100 === 0;
          if (aIsEmpty !== bIsEmpty) return aIsEmpty ? 1 : -1;

          const relevanceDiff = relevanceScore(a.name, query) - relevanceScore(b.name, query);
          if (Math.abs(relevanceDiff) < 50) {
            return b._nutrientCount - a._nutrientCount;
          }
          return relevanceDiff;
        })
        .slice(0, 5)
        .map(({ _nutrientCount, ...rest }) => rest);
    } catch {
      // USDA being unreachable shouldn't break NZ-based search.
    }
  }

  // Don't show USDA results we already have cached (dedupe by fdc_id).
  const cachedFdcIds = new Set((personal ?? []).map((f) => f.usda_fdc_id).filter(Boolean));
  const usda = usdaResults.filter((f) => !cachedFdcIds.has(String(f.fdcId)));

  // Return NZ results as the primary food database, personal custom foods
  // separately, and USDA only as a fallback when NZ had insufficient results.
  return NextResponse.json({ personal: personal ?? [], nz: nzResults, usda });
}
