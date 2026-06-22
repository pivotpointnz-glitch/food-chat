import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface CreateLogBody {
  foodId: string;
  quantity: number;
  unit: string;
  gramsEquivalent: number;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  source: "manual" | "voice";
  loggedAt?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: CreateLogBody = await request.json();

  const { data: food, error: foodError } = await supabase
    .from("foods")
    .select("calories_per_100, protein_g_per_100, carbs_g_per_100, fat_g_per_100")
    .eq("id", body.foodId)
    .single();

  if (foodError || !food) {
    return NextResponse.json({ error: "Food not found" }, { status: 404 });
  }

  const factor = body.gramsEquivalent / 100;

  const { data: log, error } = await supabase
    .from("logs")
    .insert({
      user_id: user.id,
      food_id: body.foodId,
      quantity: body.quantity,
      unit: body.unit,
      grams_equivalent: body.gramsEquivalent,
      calories: food.calories_per_100 * factor,
      protein_g: food.protein_g_per_100 * factor,
      carbs_g: food.carbs_g_per_100 * factor,
      fat_g: food.fat_g_per_100 * factor,
      meal_type: body.mealType,
      source: body.source,
      logged_at: body.loggedAt ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ log });
}
