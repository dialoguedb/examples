import { NextResponse } from "next/server";
import { db } from "@/lib/dialoguedb";

/** DELETE /api/chat/:id — Delete a chat and all its messages. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.deleteDialogue(id);
  return NextResponse.json({ deleted: true });
}
