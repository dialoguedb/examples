import type { Message as OllamaMessage } from "ollama";
import type { Dialogue, DialogueDB } from "dialogue-db";

/**
 * Bridge between DialogueDB and Ollama's chat API.
 *
 * Both use the same { role, content } shape, so the mapping is direct: save
 * each turn as a row, reload in order, and pass straight to Ollama. DialogueDB
 * is the source of truth; the process holds nothing.
 */

export function toChatMessages(dialogue: Dialogue): OllamaMessage[] {
  return dialogue.messages.map((m): OllamaMessage => {
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
