import { NextResponse } from "next/server";
import { db } from "@/lib/dialoguedb";

/** POST /api/chat — Create a new chat. */
export async function POST(request: Request) {
  const body = await request.json();

  // DialogueDB: create a dialogue to represent this chat.
  // Store the system prompt in dialogue state so it persists across restarts.
  const dialogue = await db.createDialogue({
    label: body.label,
    state: body.systemPrompt ? { systemPrompt: body.systemPrompt } : undefined,
  });

  return NextResponse.json(
    { id: dialogue.id, label: body.label ?? null },
    { status: 201 }
  );
}

/** GET /api/chat — List all chats. */
export async function GET() {
  const { items } = await db.listDialogues();
  return NextResponse.json(items.map((d) => ({ id: d.id, label: d.label })));
}
