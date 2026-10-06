import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Dialogue, DialogueDB } from "dialogue-db";

/**
 * Bridge between DialogueDB and DeepSeek's chat completions (OpenAI-compatible).
 */

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
