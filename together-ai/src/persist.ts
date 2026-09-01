import type { Dialogue, DialogueDB } from "dialogue-db";
import type Together from "together-ai";

/**
 * The bridge between DialogueDB and Together AI's chat completions.
 *
 * Together's SDK uses the same { role, content } shape as most chat APIs.
 * Save each turn as a row, reload in order, hand them back to the API.
 * DialogueDB is the source of truth; the process holds nothing.
 */

export function toChatMessages(
  dialogue: Dialogue,
): Together.Chat.CompletionCreateParams.Message[] {
  return dialogue.messages.map(
    (m): Together.Chat.CompletionCreateParams.Message => {
      const content = String(m.content);
      switch (m.role) {
        case "user":
          return { role: "user", content };
        case "system":
          return { role: "system", content };
        default:
          return { role: "assistant", content };
      }
    },
  );
}

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
