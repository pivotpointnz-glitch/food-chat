import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface CacheUsdaBody {
  fdcId: number;
  name: string;
  brand: string | null;
  caloriesPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100?: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: CacheUsdaBody = await request.json();

  // If this USDA food is already cached, just return it rather than duplicating.
  const { data: existing } = await supabase
    .from("foods")
    .select("*")
    .eq("usda_fdc_id", String(body.fdcId))
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ food: existing });
  }

  const { data: inserted, error } = await supabase
    .from("foods")
    .insert({
      owner_id: null,
      source: "usda",
      visibility: "shared",
      usda_fdc_id: String(body.fdcId),
      is_composite: false,
      name: body.name,
      brand: body.brand,
      base_unit: "g",
      default_quantity: 100,
      default_unit: "g",
      calories_per_100: body.caloriesPer100,
      protein_g_per_100: body.proteinPer100,
      carbs_g_per_100: body.carbsPer100,
      fat_g_per_100: body.fatPer100,
      fiber_g_per_100: body.fiberPer100 ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ food: inserted });
}
