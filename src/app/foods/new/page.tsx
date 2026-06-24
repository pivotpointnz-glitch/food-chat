"use client";

import { useRouter } from "next/navigation";
import { FoodForm, type FoodFormPayload } from "@/components/FoodForm";

export default function NewFoodPage() {
  const router = useRouter();

  async function handleSave(payload: FoodFormPayload) {
    const res = await fetch("/api/foods/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  return (
    <FoodForm
      title="Create a custom food"
      onSave={handleSave}
      onSaved={() => router.push("/log/new")}
    />
  );
}
