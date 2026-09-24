import type {
  ContentBlock,
  Message,
  SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import type { Dialogue, DialogueDB, MessageContent } from "dialogue-db";

/**
 * The bridge between DialogueDB messages and the arrays Bedrock's Converse API
 * takes.
 *
 * A dialogue can be written by any SDK, so the stored content is not always
 * Bedrock-shaped. Anthropic examples store arrays of { type: "tool_use", ... }
 * blocks, and OpenAI tool calls have their own shape. Anything unrecognized is
 * serialized to text so the information stays in the prompt instead of being
 * dropped.
 */

const BEDROCK_BLOCK_KEYS: readonly string[] = [
  "text",
  "image",
  "document",
  "video",
  "toolUse",
  "toolResult",
  "guardContent",
  "reasoningContent",
];

function isBedrockBlock(value: unknown): value is ContentBlock {
  if (typeof value !== "object" || value === null) return false;
  return BEDROCK_BLOCK_KEYS.some((key) => key in value);
}

function toBlock(value: unknown): ContentBlock {
  if (typeof value === "string") return { text: value };
  if (isBedrockBlock(value)) return value;
  return { text: JSON.stringify(value) };
}

export function toContentBlocks(content: MessageContent): ContentBlock[] {
  if (typeof content === "string") return [{ text: content }];
  if (Array.isArray(content)) return content.map(toBlock);
  return [toBlock(content)];
}

/**
 * Stored messages back to the array Bedrock's Converse API takes.
 *
 * System messages are left out: Bedrock takes them as a top-level `system`
 * parameter. Use toSystemPrompt for those.
 */
export function toBedrockMessages(dialogue: Dialogue): Message[] {
  return dialogue.messages
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: toContentBlocks(msg.content),
    }));
}

export function toSystemPrompt(
  dialogue: Dialogue,
): SystemContentBlock[] | undefined {
  const blocks: SystemContentBlock[] = dialogue.messages
    .filter((msg) => msg.role === "system")
    .map((msg) => {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return { text };
    })
    .filter((block) => block.text.length > 0);

  return blocks.length > 0 ? blocks : undefined;
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
