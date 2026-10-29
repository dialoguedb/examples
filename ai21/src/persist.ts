import type { ChatMessageParam } from "ai21";
import type { Dialogue, DialogueDB } from "dialogue-db";

/**
 * Bridge between DialogueDB messages and the AI21 chat completions API.
 *
 * AI21's Jamba models accept messages as { role, content } — the same shape
 * DialogueDB stores — so the mapping is direct. Save each turn as a row,
 * reload in order, hand them to the API.
 */

export function toChatMessages(dialogue: Dialogue): ChatMessageParam[] {
  return dialogue.messages.map((m): ChatMessageParam => {
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
