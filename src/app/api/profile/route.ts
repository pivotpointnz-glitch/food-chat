import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface UpdateProfileBody {
  displayName?: string;
  targetCalories?: number | null;
  targetProteinG?: number | null;
  targetCarbsG?: number | null;
  targetFatG?: number | null;
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: UpdateProfileBody = await request.json();

  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined) update.display_name = body.displayName;
  if (body.targetCalories !== undefined) update.target_calories = body.targetCalories;
  if (body.targetProteinG !== undefined) update.target_protein_g = body.targetProteinG;
  if (body.targetCarbsG !== undefined) update.target_carbs_g = body.targetCarbsG;
  if (body.targetFatG !== undefined) update.target_fat_g = body.targetFatG;

  const { data: profile, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile });
}
