import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm the food exists and is owned by this user before doing anything else.
  const { data: food, error: foodError } = await supabase
    .from("foods")
    .select("id, owner_id, name")
    .eq("id", id)
    .single();

  if (foodError || !food) {
    return NextResponse.json({ error: "Food not found" }, { status: 404 });
  }

  if (food.owner_id !== user.id) {
    return NextResponse.json({ error: "You can only delete your own foods" }, { status: 403 });
  }

  // Check whether it's been logged before — the DB foreign key would block
  // the delete anyway (logs.food_id has ON DELETE RESTRICT), but we want a
  // clear, friendly error rather than a raw Postgres constraint error.
  const { count: logCount } = await supabase
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("food_id", id);

  if (logCount && logCount > 0) {
    return NextResponse.json(
      {
        error: `"${food.name}" has been logged ${logCount} time${logCount === 1 ? "" : "s"} and can't be deleted. You can still remove individual log entries from your history if needed.`,
      },
      { status: 409 }
    );
  }

  // If this is a composite food, its component links get cleaned up via
  // ON DELETE CASCADE on composite_food_items — no manual cleanup needed.
  const { error: deleteError } = await supabase.from("foods").delete().eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
