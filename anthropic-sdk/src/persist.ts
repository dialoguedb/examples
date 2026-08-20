import type Anthropic from "@anthropic-ai/sdk";
import type { Dialogue, DialogueDB, MessageContent } from "dialogue-db";

/**
 * The bridge between DialogueDB messages and the array the Messages API takes.
 *
 * Two rules drive this file.
 *
 * A system prompt is not a message. The API only accepts "user" and "assistant"
 * in messages[], and rejects the request outright otherwise:
 *   messages.0: use the top-level 'system' parameter for the initial system prompt
 * So stored system messages are pulled out separately by toSystemPrompt.
 *
 * Assistant content is an array of blocks. dialogue-db stores structured content
 * as-is, so response.content round-trips verbatim and tool_use / tool_result
 * blocks survive a restart without being flattened to text.
 */

function isContentBlockParams(value: unknown): value is Anthropic.ContentBlockParam[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === "object" && item !== null && "type" in item,
    )
  );
}

/** Normalize stored content into what a MessageParam accepts. */
function toContent(content: MessageContent): string | Anthropic.ContentBlockParam[] {
  if (typeof content === "string") return content;
  if (isContentBlockParams(content)) return content;
  // An object that is not a block array (content written by another SDK) stays
  // readable as JSON rather than being dropped.
  return JSON.stringify(content);
}

/** Stored messages back to the array messages.create takes. */
export function toMessageParams(dialogue: Dialogue): Anthropic.MessageParam[] {
  return dialogue.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: toContent(message.content),
    }));
}

/** The stored system messages, joined, for the top-level system parameter. */
export function toSystemPrompt(dialogue: Dialogue): string | undefined {
  const prompts = dialogue.messages
    .filter((message) => message.role === "system")
    .map((message) => {
      const content = toContent(message.content);
      if (typeof content === "string") return content;
      return content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
    })
    .filter((text) => text.length > 0);

  return prompts.length > 0 ? prompts.join("\n\n") : undefined;
}

/**
 * Add a prompt-cache breakpoint to the final block of the conversation prefix.
 *
 * Returns new objects rather than mutating: the blocks handed in belong to the
 * dialogue, and writing cache_control onto them would alter stored state.
 */
const CACHE_CONTROL: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

export function withCacheHint(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;

  const last = messages[messages.length - 1];
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === "string"
      ? [{ type: "text", text: last.content }]
      : [...last.content];

  if (blocks.length === 0) return messages;

  const marked: Anthropic.ContentBlockParam[] = blocks.map((block, index) =>
    index === blocks.length - 1 ? { ...block, cache_control: CACHE_CONTROL } : block,
  );

  return [...messages.slice(0, -1), { role: last.role, content: marked }];
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
