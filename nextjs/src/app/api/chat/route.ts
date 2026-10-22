import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  return dialogue.messages.map((m) => {
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "assistant") {
      return { role: "assistant" as const, content };
    }
    return { role: "user" as const, content };
  });
}

// POST /api/chat — Send a message and get an AI response.
// Body: { message: string, dialogueId?: string }
// Omit dialogueId to start a new conversation.
export async function POST(request: NextRequest) {
  const body: { message?: string; dialogueId?: string } =
    await request.json();

  if (!body.message) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  // DialogueDB: get an existing dialogue or create a new one.
  let dialogue: Dialogue;
  if (body.dialogueId) {
    const existing = await db.getDialogue(body.dialogueId);
    if (!existing) {
      return NextResponse.json(
        { error: "Dialogue not found" },
        { status: 404 }
      );
    }
    dialogue = existing;
    await dialogue.loadMessages({ order: "asc" });
  } else {
    dialogue = await db.createDialogue({ label: "nextjs-chat" });
  }

  // DialogueDB: persist the user message before calling the LLM.
  await dialogue.saveMessage({ role: "user", content: body.message });

  // Call GPT with the full conversation history from DialogueDB.
  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: toOpenAIMessages(dialogue),
  });
  const reply = completion.choices[0].message.content ?? "";

  // DialogueDB: persist the assistant response.
  await dialogue.saveMessage({ role: "assistant", content: reply });

  return NextResponse.json({
    dialogueId: dialogue.id,
    role: "assistant",
    content: reply,
  });
}

// GET /api/chat?dialogueId=... — Retrieve conversation history.
export async function GET(request: NextRequest) {
  const dialogueId = request.nextUrl.searchParams.get("dialogueId");
  if (!dialogueId) {
    return NextResponse.json(
      { error: "dialogueId query param is required" },
      { status: 400 }
    );
  }

  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) {
    return NextResponse.json(
      { error: "Dialogue not found" },
      { status: 404 }
    );
  }

  await dialogue.loadMessages({ order: "asc" });

  return NextResponse.json({
    dialogueId: dialogue.id,
    messages: dialogue.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });
}

// DELETE /api/chat?dialogueId=... — Delete a conversation.
export async function DELETE(request: NextRequest) {
  const dialogueId = request.nextUrl.searchParams.get("dialogueId");
  if (!dialogueId) {
    return NextResponse.json(
      { error: "dialogueId query param is required" },
      { status: 400 }
    );
  }

  await db.deleteDialogue(dialogueId);
  return NextResponse.json({ deleted: true });
}
