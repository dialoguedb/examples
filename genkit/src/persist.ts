import type { MessageData } from "genkit";
import type { Dialogue, DialogueDB, MessageContent } from "dialogue-db";

/**
 * Bridge between DialogueDB messages and the MessageData array Genkit takes.
 *
 * DialogueDB stores messages with role "assistant"; Genkit uses "model" for
 * the same concept. Content in DialogueDB can be a string, object, or array;
 * Genkit always wants Part[]. This module handles both translations.
 *
 * A dialogue may contain messages written by a different SDK. Parts that
 * already look like Genkit Parts (have a `text`, `media`, `toolRequest`, or
 * `toolResponse` field) are forwarded as-is; anything else is serialized to
 * a text part so the information still reaches the model.
 */

const GENKIT_PART_KEYS: readonly string[] = [
  "text",
  "media",
  "data",
  "toolRequest",
  "toolResponse",
  "custom",
];

function isGenkitPart(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return GENKIT_PART_KEYS.some((key) => key in value);
}

function toGenkitParts(
  content: MessageContent,
): Array<{ text: string } | Record<string, unknown>> {
  if (typeof content === "string") return [{ text: content }];
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return { text: item };
      if (isGenkitPart(item)) return item as Record<string, unknown>;
      return { text: JSON.stringify(item) };
    });
  }
  if (isGenkitPart(content)) return [content as Record<string, unknown>];
  return [{ text: JSON.stringify(content) }];
}

function toGenkitRole(role: string): MessageData["role"] {
  if (role === "assistant") return "model";
  if (role === "model") return "model";
  if (role === "tool") return "tool";
  if (role === "system") return "system";
  return "user";
}

/**
 * Convert all non-system messages from a dialogue into Genkit history.
 * System messages are handled separately via getSystemPrompt.
 */
export function toGenkitHistory(dialogue: Dialogue): MessageData[] {
  return dialogue.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: toGenkitRole(m.role),
      content: toGenkitParts(m.content),
    }));
}

/**
 * Extract the system prompt from stored system messages.
 * Genkit takes system as a top-level parameter, not as a conversation turn.
 */
export function getSystemPrompt(dialogue: Dialogue): string | undefined {
  const parts = dialogue.messages
    .filter((m) => m.role === "system")
    .map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    )
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
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
