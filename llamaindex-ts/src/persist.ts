/**
 * The bridge between DialogueDB messages and LlamaIndex's ChatMessage format.
 *
 * LlamaIndex messages carry an optional `options` field for tool-call metadata
 * (tool invocations, tool results). DialogueDB metadata only accepts flat
 * values, so we JSON-serialize options into a string for storage and parse
 * them back on load. Plain text messages map directly with no extra work.
 */

import type { ChatMessage, MessageContent, ToolCallLLMMessageOptions } from "llamaindex";
import type { Dialogue, MessageContent as DbMessageContent } from "dialogue-db";

type LlamaChatMessage = ChatMessage<ToolCallLLMMessageOptions>;

/** Convert a DialogueDB stored content value to what LlamaIndex accepts. */
function toLlamaContent(content: DbMessageContent): MessageContent {
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

function isToolCallOptions(value: unknown): value is { toolCall: unknown[] } {
  if (typeof value !== "object" || value === null || !("toolCall" in value)) return false;
  const candidate: { toolCall: unknown } = value;
  return Array.isArray(candidate.toolCall);
}

function isToolResultOptions(value: unknown): value is { toolResult: { id: string; result: string; isError: boolean } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toolResult" in value
  );
}

function parseStoredOptions(json: string): ToolCallLLMMessageOptions | undefined {
  try {
    const parsed: unknown = JSON.parse(json);
    if (isToolCallOptions(parsed) || isToolResultOptions(parsed)) return parsed;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Stored messages back to the ChatMessage array LlamaIndex engines take. */
export function toLlamaMessages(dialogue: Dialogue): LlamaChatMessage[] {
  return dialogue.messages.map((message) => {
    const msg: LlamaChatMessage = {
      role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
      content: toLlamaContent(message.content),
    };

    const stored = message.metadata?.llamaindex_options;
    if (typeof stored === "string") {
      const options = parseStoredOptions(stored);
      if (options) msg.options = options;
    }

    return msg;
  });
}

/**
 * Save a LlamaIndex ChatMessage to a DialogueDB dialogue.
 *
 * The `options` field (tool calls, tool results) is preserved as a
 * JSON string in metadata so it survives a round trip through DialogueDB.
 */
export async function saveLlamaMessage(
  dialogue: Dialogue,
  message: LlamaChatMessage,
): Promise<void> {
  await dialogue.saveMessage({
    role: message.role,
    content: message.content,
    ...(message.options
      ? { metadata: { llamaindex_options: JSON.stringify(message.options) } }
      : {}),
  });
}
