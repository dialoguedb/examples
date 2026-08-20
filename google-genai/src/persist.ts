import type { Content, Part } from "@google/genai";
import type { Dialogue, DialogueDB, MessageContent } from "dialogue-db";

/**
 * The bridge between DialogueDB messages and the Content array Gemini takes.
 *
 * A dialogue is meant to be shared across SDKs, so the stored content is not
 * always Gemini-shaped: the Anthropic examples store an array of content blocks
 * like { type: "tool_use", ... }, and OpenAI-style tool calls have their own
 * shape. Gemini validates every part against its own oneof, so forwarding a
 * foreign object verbatim fails the request with
 * "parts[n].data: required oneof field 'data' must have one initialized field".
 * Anything unrecognized is therefore serialized to text, which keeps the
 * information in the prompt instead of dropping the turn.
 */

/** Fields that identify an object as something Gemini already understands. */
const GEMINI_PART_KEYS: readonly string[] = [
  "text",
  "inlineData",
  "fileData",
  "functionCall",
  "functionResponse",
  "executableCode",
  "codeExecutionResult",
  "toolCall",
  "toolResponse",
];

function isGeminiPart(value: unknown): value is Part {
  if (typeof value !== "object" || value === null) return false;
  return GEMINI_PART_KEYS.some((key) => key in value);
}

function toPart(value: Record<string, unknown>): Part {
  if (isGeminiPart(value)) return value;
  return { text: JSON.stringify(value) };
}

/** Normalize one stored content value into parts Gemini will accept. */
export function toParts(content: MessageContent): Part[] {
  if (typeof content === "string") return [{ text: content }];
  if (Array.isArray(content)) return content.map(toPart);
  return [toPart(content)];
}

/**
 * Stored messages back to the Content array Gemini takes.
 *
 * System messages are left out on purpose: Gemini takes them as a top-level
 * systemInstruction, and folding them into the turns as "user" would let the
 * model answer them as if they were the question. Use toSystemInstruction.
 */
export function toGeminiContents(dialogue: Dialogue): Content[] {
  return dialogue.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: toParts(message.content),
    }));
}

/** The stored system messages, joined, for Gemini's systemInstruction. */
export function toSystemInstruction(dialogue: Dialogue): string | undefined {
  const instructions = dialogue.messages
    .filter((message) => message.role === "system")
    .map((message) =>
      toParts(message.content)
        .map((part) => part.text ?? "")
        .join(""),
    )
    .filter((text) => text.length > 0);

  return instructions.length > 0 ? instructions.join("\n\n") : undefined;
}

/** Get or create a dialogue and load its history, oldest first. */
export async function loadDialogue(
  db: DialogueDB,
  id: string,
  namespace: string,
): Promise<Dialogue> {
  const dialogue = await db.getOrCreateDialogue({ id, namespace });
  await dialogue.loadMessages({ order: "asc" });
  return dialogue;
}
