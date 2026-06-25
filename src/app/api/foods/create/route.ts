import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ComponentInput {
  foodId: string;
  quantity: number;
  unit: string;
  gramsEquivalent: number;
}

interface CreateFoodBody {
  name: string;
  brand?: string | null;
  visibility: "private" | "shared";
  isComposite: boolean;
  baseUnit: "g" | "ml";
  defaultQuantity: number;
  defaultUnit: string;
  gramsPerDefaultUnit?: number | null;
  // For simple foods: macros per 100 base units, entered directly.
  caloriesPer100?: number;
  proteinPer100?: number;
  carbsPer100?: number;
  fatPer100?: number;
  fiberPer100?: number;
  // For composite foods: list of components to sum macros from.
  components?: ComponentInput[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: CreateFoodBody = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let caloriesPer100 = body.caloriesPer100 ?? 0;
  let proteinPer100 = body.proteinPer100 ?? 0;
  let carbsPer100 = body.carbsPer100 ?? 0;
  let fatPer100 = body.fatPer100 ?? 0;
  let fiberPer100 = body.fiberPer100 ?? 0;
  let totalGrams = body.defaultQuantity;

  // For composite foods, fetch each component's macros and sum them,
  // weighted by how much of each component is used (in grams/ml).
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
      .select("id, calories_per_100, protein_g_per_100, carbs_g_per_100, fat_g_per_100, fiber_g_per_100")
      .in("id", componentIds);

    if (componentError || !componentFoods) {
      return NextResponse.json({ error: "Failed to load component foods" }, { status: 500 });
    }

    const foodMap = new Map(componentFoods.map((f) => [f.id, f]));

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalFiber = 0;
    let sumGrams = 0;

    for (const comp of components) {
      const food = foodMap.get(comp.foodId);
      if (!food) continue;
      const factor = comp.gramsEquivalent / 100;
      totalCalories += food.calories_per_100 * factor;
      totalProtein += food.protein_g_per_100 * factor;
      totalCarbs += food.carbs_g_per_100 * factor;
      totalFat += food.fat_g_per_100 * factor;
      totalFiber += food.fiber_g_per_100 * factor;
      sumGrams += comp.gramsEquivalent;
    }

    totalGrams = sumGrams;
    // Store macros per 100g/ml of the *whole composite*, so logging it later
    // works exactly like any other food (quantity in grams * per-100 factor).
    const normalizingFactor = sumGrams > 0 ? 100 / sumGrams : 0;
    caloriesPer100 = totalCalories * normalizingFactor;
    proteinPer100 = totalProtein * normalizingFactor;
    carbsPer100 = totalCarbs * normalizingFactor;
    fatPer100 = totalFat * normalizingFactor;
    fiberPer100 = totalFiber * normalizingFactor;
  }

  const { data: food, error: foodError } = await supabase
    .from("foods")
    .insert({
      owner_id: user.id,
      source: "custom",
      visibility: body.visibility,
      is_composite: body.isComposite,
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
      fiber_g_per_100: fiberPer100,
    })
    .select("*")
    .single();

  if (foodError || !food) {
    return NextResponse.json({ error: foodError?.message ?? "Failed to create food" }, { status: 500 });
  }

  if (body.isComposite && body.components) {
    const rows = body.components.map((comp, index) => ({
      composite_food_id: food.id,
      component_food_id: comp.foodId,
      quantity: comp.quantity,
      unit: comp.unit,
      grams_equivalent: comp.gramsEquivalent,
      sort_order: index,
    }));

    const { error: itemsError } = await supabase.from("composite_food_items").insert(rows);

    if (itemsError) {
      // Roll back the food row so we don't leave an orphaned composite with no items.
      await supabase.from("foods").delete().eq("id", food.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ food });
}
