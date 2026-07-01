import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toGramsEquivalent } from "@/lib/units";

interface UpdateLogBody {
  quantity: number;
  unit: string;
  gramsPerEach?: number | null;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  loggedAt: string;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm ownership before allowing edit.
  const { data: existing, error: existingError } = await supabase
    .from("logs")
    .select("id, user_id, food_id")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
  }

  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "You can only edit your own log entries" }, { status: 403 });
  }

  const body: UpdateLogBody = await request.json();

  // Re-fetch the food's current per-100g values to recalculate macros.
  const { data: food, error: foodError } = await supabase
    .from("foods")
    .select("calories_per_100, protein_g_per_100, carbs_g_per_100, fat_g_per_100, fiber_g_per_100")
    .eq("id", existing.food_id)
    .single();

  if (foodError || !food) {
    return NextResponse.json({ error: "Food not found" }, { status: 404 });
  }

  const gramsEquivalent = toGramsEquivalent(body.quantity, body.unit, body.gramsPerEach ?? null);
  const factor = gramsEquivalent / 100;

  const { data: updated, error: updateError } = await supabase
    .from("logs")
    .update({
      quantity: body.quantity,
      unit: body.unit,
      grams_equivalent: gramsEquivalent,
      calories: food.calories_per_100 * factor,
      protein_g: food.protein_g_per_100 * factor,
      carbs_g: food.carbs_g_per_100 * factor,
      fat_g: food.fat_g_per_100 * factor,
      fiber_g: food.fiber_g_per_100 * factor,
      meal_type: body.mealType,
      logged_at: body.loggedAt,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ log: updated });
}
