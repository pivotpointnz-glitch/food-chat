import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only deletes this user's own log entries (RLS also enforces this), and
  // never touches the foods/recipes table — those are kept intact.
  const { error, count } = await supabase
    .from("logs")
    .delete({ count: "exact" })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deletedCount: count ?? 0 });
}
