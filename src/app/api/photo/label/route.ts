import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

interface LabelData {
  foodName: string | null;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageBase64, mediaType } = await request.json();

  if (!imageBase64) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: "This is a nutrition information label. Extract the macronutrient values exactly as printed. Use the per-serving values (not per-100g). If you can read the product name from the label, include it. All values should be numbers only (no units in the value fields).",
            },
          ],
        },
      ],
      tools: [
        {
          name: "extract_label_data",
          description: "Records the nutrition information extracted from the label.",
          input_schema: {
            type: "object",
            properties: {
              foodName: {
                type: "string",
                description: "Product name if visible on the label, or null if not visible",
              },
              servingSize: {
                type: "number",
                description: "Serving size as a number (e.g. 30 for '30g per serve')",
              },
              servingUnit: {
                type: "string",
                description: "Unit for serving size (e.g. 'g', 'ml', 'cup')",
              },
              calories: {
                type: "number",
                description: "Calories/energy per serving in kcal. If label shows kJ, divide by 4.184.",
              },
              protein: {
                type: "number",
                description: "Protein per serving in grams",
              },
              carbs: {
                type: "number",
                description: "Total carbohydrates per serving in grams",
              },
              fat: {
                type: "number",
                description: "Total fat per serving in grams",
              },
              fiber: {
                type: "number",
                description: "Dietary fiber per serving in grams, or 0 if not listed",
              },
            },
            required: ["servingSize", "servingUnit", "calories", "protein", "carbs", "fat", "fiber"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "extract_label_data" },
    });

    const toolUseBlock = message.content.find((block) => block.type === "tool_use");
    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Could not read the nutrition label" }, { status: 500 });
    }

    const label = toolUseBlock.input as LabelData;
    return NextResponse.json({ label });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Label reading failed: ${msg}` }, { status: 500 });
  }
}
