import type { ChatRequestMessage } from "@azure-rest/ai-inference";
import type { Dialogue, DialogueDB, MessageContent } from "dialogue-db";

function contentToString(content: MessageContent): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

/**
 * Convert stored DialogueDB messages to the discriminated union that
 * Azure AI Inference expects. Each branch constructs a literal role so
 * TypeScript narrows to the correct union member without a cast.
 */
export function toChatMessages(dialogue: Dialogue): ChatRequestMessage[] {
  return dialogue.messages.map((m): ChatRequestMessage => {
    const content = contentToString(m.content);
    switch (m.role) {
      case "system":
        return { role: "system", content };
      case "assistant":
        return { role: "assistant", content };
      default:
        return { role: "user", content };
    }
  });
}

export async function loadDialogue(
  db: DialogueDB,
  id: string,
  namespace: string,
): Promise<Dialogue> {
  const dialogue = await db.getOrCreateDialogue({ id, namespace });
  await dialogue.loadMessages({ order: "asc" });
  return dialogue;
}
