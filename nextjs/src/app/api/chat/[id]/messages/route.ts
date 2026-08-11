import { NextResponse } from "next/server";
import OpenAI from "openai";
import { db } from "@/lib/dialoguedb";
import type { Dialogue } from "dialogue-db";

const openai = new OpenAI();
const MODEL = "gpt-4o-mini";

function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  const state = dialogue.state as Record<string, unknown> | null;
  const systemPrompt =
    state && typeof state.systemPrompt === "string"
      ? state.systemPrompt
      : "You are a helpful assistant.";

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of dialogue.messages) {
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);

    if (m.role === "assistant") {
      messages.push({ role: "assistant", content });
    } else {
      messages.push({ role: "user", content });
    }
  }

  return messages;
}

/** POST /api/chat/:id/messages — Send a message and get an AI response. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dialogue = await db.getDialogue(id);
  if (!dialogue) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const body = await request.json();
  if (!body.message) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  // DialogueDB: load existing history so the LLM has full context.
  await dialogue.loadMessages({ order: "asc" });

  // DialogueDB: persist the user message before calling the LLM.
  await dialogue.saveMessage({ role: "user", content: body.message });

  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: toOpenAIMessages(dialogue),
  });

  const reply = completion.choices[0].message.content ?? "";

  // DialogueDB: persist the assistant response. The full exchange now
  // survives server restarts, redeployments, and serverless cold starts.
  await dialogue.saveMessage({ role: "assistant", content: reply });

  return NextResponse.json({ role: "assistant", content: reply });
}

/** GET /api/chat/:id/messages — Get message history. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dialogue = await db.getDialogue(id);
  if (!dialogue) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // DialogueDB: load all persisted messages in chronological order.
  await dialogue.loadMessages({ order: "asc" });

  return NextResponse.json(
    dialogue.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))
  );
}
