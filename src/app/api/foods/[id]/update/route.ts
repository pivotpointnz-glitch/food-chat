import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ComponentInput {
  foodId: string;
  quantity: number;
  unit: string;
  gramsEquivalent: number;
}

interface UpdateFoodBody {
  name: string;
  brand?: string | null;
  visibility: "private" | "shared";
  isComposite: boolean;
  baseUnit: "g" | "ml";
  defaultQuantity: number;
  defaultUnit: string;
  gramsPerDefaultUnit?: number | null;
  caloriesPer100?: number;
  proteinPer100?: number;
  carbsPer100?: number;
  fatPer100?: number;
  components?: ComponentInput[];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: food, error } = await supabase.from("foods").select("*").eq("id", id).single();

  if (error || !food) {
    return NextResponse.json({ error: "Food not found" }, { status: 404 });
  }

  if (food.owner_id !== user.id) {
    return NextResponse.json({ error: "You can only edit your own foods" }, { status: 403 });
  }

  let components: Array<{
    food: {
      id: string;
      name: string;
      calories_per_100: number;
      protein_g_per_100: number;
      carbs_g_per_100: number;
      fat_g_per_100: number;
      default_unit: string;
      default_quantity: number;
      base_unit: string;
    };
    quantity: number;
    unit: string;
    grams_equivalent: number;
  }> = [];

  if (food.is_composite) {
    const { data: items } = await supabase
      .from("composite_food_items")
      .select(
        "quantity, unit, grams_equivalent, food:foods!component_food_id(id, name, calories_per_100, protein_g_per_100, carbs_g_per_100, fat_g_per_100, default_unit, default_quantity, base_unit)"
      )
      .eq("composite_food_id", id)
      .order("sort_order", { ascending: true });

    components = (items ?? []).map((item) => ({
      food: item.food as unknown as (typeof components)[0]["food"],
      quantity: item.quantity,
      unit: item.unit,
      grams_equivalent: item.grams_equivalent,
    }));
  }

  return NextResponse.json({ food, components });
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

  // Confirm ownership before allowing any edit.
  const { data: existing, error: existingError } = await supabase
    .from("foods")
    .select("id, owner_id")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Food not found" }, { status: 404 });
  }

  if (existing.owner_id !== user.id) {
    return NextResponse.json({ error: "You can only edit your own foods" }, { status: 403 });
  }

  const body: UpdateFoodBody = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let caloriesPer100 = body.caloriesPer100 ?? 0;
  let proteinPer100 = body.proteinPer100 ?? 0;
  let carbsPer100 = body.carbsPer100 ?? 0;
  let fatPer100 = body.fatPer100 ?? 0;
  let totalGrams = body.defaultQuantity;

  if (body.isComposite) {
    const components = body.components ?? [];
    if (components.length === 0) {
      return NextResponse.json(
        { error: "A composite food needs at least one component" },
        { status: 400 }
      );
    }

    const componentIds = components.map((c) => c.foodId);
    const { data: componentFoods, error: componentError } = await supabase
      .from("foods")
      .select("id, calories_per_100, protein_g_per_100, carbs_g_per_100, fat_g_per_100")
      .in("id", componentIds);

    if (componentError || !componentFoods) {
      return NextResponse.json({ error: "Failed to load component foods" }, { status: 500 });
    }

    const foodMap = new Map(componentFoods.map((f) => [f.id, f]));

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let sumGrams = 0;

    for (const comp of components) {
      const food = foodMap.get(comp.foodId);
      if (!food) continue;
      const factor = comp.gramsEquivalent / 100;
      totalCalories += food.calories_per_100 * factor;
      totalProtein += food.protein_g_per_100 * factor;
      totalCarbs += food.carbs_g_per_100 * factor;
      totalFat += food.fat_g_per_100 * factor;
      sumGrams += comp.gramsEquivalent;
    }

    totalGrams = sumGrams;
    const normalizingFactor = sumGrams > 0 ? 100 / sumGrams : 0;
    caloriesPer100 = totalCalories * normalizingFactor;
    proteinPer100 = totalProtein * normalizingFactor;
    carbsPer100 = totalCarbs * normalizingFactor;
    fatPer100 = totalFat * normalizingFactor;
  }

  const { error: updateError } = await supabase
    .from("foods")
    .update({
      visibility: body.visibility,
      name: body.name.trim(),
      brand: body.brand || null,
      base_unit: body.baseUnit,
      default_quantity: body.isComposite ? totalGrams : body.defaultQuantity,
      default_unit: body.isComposite ? body.baseUnit : body.defaultUnit,
      grams_per_default_unit: body.gramsPerDefaultUnit ?? null,
      calories_per_100: caloriesPer100,
      protein_g_per_100: proteinPer100,
      carbs_g_per_100: carbsPer100,
      fat_g_per_100: fatPer100,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // For composite foods, replace all component links wholesale — simpler
  // and safer than trying to diff additions/removals/edits individually.
  if (body.isComposite && body.components) {
    const { error: deleteError } = await supabase
      .from("composite_food_items")
      .delete()
      .eq("composite_food_id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const rows = body.components.map((comp, index) => ({
      composite_food_id: id,
      component_food_id: comp.foodId,
      quantity: comp.quantity,
      unit: comp.unit,
      grams_equivalent: comp.gramsEquivalent,
      sort_order: index,
    }));

    const { error: itemsError } = await supabase.from("composite_food_items").insert(rows);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
  }

  const { data: updatedFood } = await supabase.from("foods").select("*").eq("id", id).single();

  return NextResponse.json({ food: updatedFood });
}
