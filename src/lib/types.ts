// Hand-written types mirroring supabase/migrations/0001_init.sql.
// If you have the Supabase CLI set up later, you can replace this with
// `supabase gen types typescript` output for full auto-sync.

export type FoodSource = "usda" | "custom";
export type FoodVisibility = "private" | "shared";
export type BaseUnit = "g" | "ml";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type LogSource = "manual" | "voice";

export interface Profile {
  id: string;
  display_name: string;
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  created_at: string;
}

export interface Food {
  id: string;
  owner_id: string | null;
  source: FoodSource;
  visibility: FoodVisibility;
  usda_fdc_id: string | null;
  is_composite: boolean;
  name: string;
  brand: string | null;
  base_unit: BaseUnit;
  default_quantity: number;
  default_unit: string;
  grams_per_default_unit: number | null;
  calories_per_100: number;
  protein_g_per_100: number;
  carbs_g_per_100: number;
  fat_g_per_100: number;
  created_at: string;
  updated_at: string;
}

export interface CompositeFoodItem {
  id: string;
  composite_food_id: string;
  component_food_id: string;
  quantity: number;
  unit: string;
  grams_equivalent: number;
  sort_order: number;
}

export interface LogEntry {
  id: string;
  user_id: string;
  food_id: string;
  quantity: number;
  unit: string;
  grams_equivalent: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_type: MealType;
  source: LogSource;
  logged_at: string;
  created_at: string;
}

// Convenience type for a log row joined with its food name — what most
// list views will actually want to render.
export interface LogEntryWithFood extends LogEntry {
  food: Pick<Food, "id" | "name" | "brand">;
}
