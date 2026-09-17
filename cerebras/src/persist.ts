import type Cerebras from "@cerebras/cerebras_cloud_sdk";
import type { Dialogue, DialogueDB } from "dialogue-db";

/**
 * Bridge between DialogueDB and the Cerebras chat completions API.
 *
 * DialogueDB stores { role, content } per message. Cerebras takes the same
 * shape, so the mapping is direct: load the rows in order and hand them
 * straight to the API.
 */

type ChatMessage =
  Cerebras.Chat.ChatCompletionCreateParams["messages"][number];

export function toChatMessages(dialogue: Dialogue): ChatMessage[] {
  return dialogue.messages.map((m): ChatMessage => {
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
