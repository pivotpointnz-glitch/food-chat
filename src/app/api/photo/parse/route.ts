import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

interface IdentifiedItem {
  name: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageBase64, mediaType } = await request.json();

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const rawApiKey = process.env.ANTHROPIC_API_KEY;
  const apiKey = rawApiKey?.trim();

  if (!apiKey) {
    return NextResponse.json({ error: "Photo recognition is not configured" }, { status: 500 });
  }

  // eslint-disable-next-line no-control-regex
  if (!/^[\x00-\xFF]*$/.test(apiKey)) {
    return NextResponse.json(
      {
        error:
          "The ANTHROPIC_API_KEY environment variable contains an invalid (non-ASCII) character. Re-copy the key directly from the Anthropic Console and re-save it.",
      },
      { status: 500 }
    );
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
              text: "Identify each distinct food item visible on this plate or in this photo. Just name each food plainly (e.g. 'grilled chicken breast', 'steamed broccoli', 'white rice') — do not estimate quantities or weights, since that isn't reliable from a photo alone. List each separately rather than combining into one entry, e.g. list a meat, a vegetable, and a starch separately even if they're on the same plate.",
            },
          ],
        },
      ],
      tools: [
        {
          name: "identify_food_items",
          description: "Records the list of distinct food items identified in the photo.",
          input_schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Plain food name, e.g. 'grilled chicken breast'",
                    },
                  },
                  required: ["name"],
                },
              },
            },
            required: ["items"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "identify_food_items" },
    });

    const toolUseBlock = message.content.find((block) => block.type === "tool_use");

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Could not identify foods in the photo" }, { status: 500 });
    }

    const input = toolUseBlock.input as { items: IdentifiedItem[] };

    return NextResponse.json({ items: input.items ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Photo recognition failed: ${message}` }, { status: 500 });
  }
}
