import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Dialogue, DialogueDB } from "dialogue-db";

/**
 * The bridge between DialogueDB and xAI's chat completions.
 *
 * A DialogueDB message is { role, content }. xAI's API (OpenAI-compatible)
 * takes the same shape, so the mapping is direct: save each turn as a row,
 * reload the rows in order, and hand them straight back to the API. DialogueDB
 * is the source of truth for the conversation; the process holds nothing.
 */

/** Convert a loaded dialogue to the message array the xAI API takes. */
export function toChatMessages(
  dialogue: Dialogue,
): ChatCompletionMessageParam[] {
  return dialogue.messages.map((m): ChatCompletionMessageParam => {
    const content = String(m.content);
    switch (m.role) {
      case "user":
        return { role: "user", content };
      case "system":
        return { role: "system", content };
      default:
        return { role: "assistant", content };
    }
  });
}

/** Load a conversation from DialogueDB with its messages in order. */
export async function loadDialogue(
  db: DialogueDB,
  id: string,
  namespace: string,
): Promise<Dialogue | null> {
  const dialogue = await db.getDialogue(id, { namespace });
  if (!dialogue) return null;
  await dialogue.loadMessages({ order: "asc" });
  return dialogue;
}
