import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

interface ParsedItem {
  name: string;
  quantity: number;
  unit: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { transcript } = await request.json();

  if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Voice parsing is not configured" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extract each distinct food item mentioned in this food log description into a structured list. Use your best judgement for quantity and unit when the person speaks naturally (e.g. "a banana" = 1 each, "two eggs" = 2 each, "a cup of rice" = 1 cup, "some chicken" = your best estimate in grams). If no quantity is given at all, default to a sensible single serving.

Transcript: "${transcript.replace(/"/g, '\\"')}"`,
        },
      ],
      tools: [
        {
          name: "log_food_items",
          description: "Records the structured list of food items extracted from a spoken food log.",
          input_schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "The food name, as plainly as possible (e.g. 'banana', 'scrambled eggs')" },
                    quantity: { type: "number", description: "Numeric quantity" },
                    unit: { type: "string", description: "Unit: 'g', 'ml', 'each', 'cup', 'tbsp', 'tsp', 'slice', etc." },
                  },
                  required: ["name", "quantity", "unit"],
                },
              },
            },
            required: ["items"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "log_food_items" },
    });

    const toolUseBlock = message.content.find((block) => block.type === "tool_use");

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Could not parse the recording" }, { status: 500 });
    }

    const input = toolUseBlock.input as { items: ParsedItem[] };

    return NextResponse.json({ items: input.items ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Voice parsing failed: ${message}` }, { status: 500 });
  }
}
