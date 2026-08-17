import { validateUIMessages, type UIMessage } from "ai";
import type { DialogueDB, MessageContent } from "dialogue-db";

/**
 * The bridge between the Vercel AI SDK's UI messages and DialogueDB.
 *
 * A useChat UIMessage is { id, role, parts }. A DialogueDB message is
 * { id, role, content }. We store the parts array as structured content, which
 * dialogue-db accepts since 2.0.1, so text, tool calls, and reasoning round-trip
 * unchanged. DialogueDB owns the message id: it is stable across reloads, which
 * is all useChat needs for React keys.
 */

export function toStoredMessages(
  messages: UIMessage[],
): { role: string; content: MessageContent }[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.parts,
  }));
}

/** Load a conversation from DialogueDB as UI messages ready for useChat. */
export async function loadUIMessages(
  db: DialogueDB,
  id: string,
  namespace: string,
): Promise<UIMessage[]> {
  const dialogue = await db.getDialogue(id, { namespace });
  if (!dialogue) return [];
  await dialogue.loadMessages({ order: "asc" });
  // validateUIMessages parses the stored rows back into typed UIMessages against
  // the SDK's own schema, so no casting is needed at the storage boundary.
  return validateUIMessages({
    messages: dialogue.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.content,
    })),
  });
}
