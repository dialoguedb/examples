import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import type { Dialogue, DialogueDB, MessageContent } from "dialogue-db";

/**
 * The bridge between DialogueDB messages and the message array Grok takes.
 *
 * xAI speaks the OpenAI chat-completions protocol, so the whole conversation is
 * resent on every call and three shapes have to survive storage: a plain text
 * turn, an assistant turn that requested tool calls, and the tool results that
 * answer them. A dialogue is also shared across SDKs, so content written by
 * another provider (Anthropic content blocks, Gemini parts) has to stay
 * readable rather than break the request.
 */

/** Stored shape of an assistant turn that asked for tools. */
const TOOL_CALLS_KEY = "toolCalls";

function isToolCallArray(value: unknown): value is ChatCompletionMessageToolCall[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === "object" && item !== null && "id" in item && "function" in item,
    )
  );
}

function readToolCalls(content: MessageContent): ChatCompletionMessageToolCall[] | undefined {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return undefined;
  const value: unknown = content[TOOL_CALLS_KEY];
  return isToolCallArray(value) ? value : undefined;
}

/** Flatten one stored content value to the string the protocol expects. */
export function toMessageText(content: MessageContent): string {
  if (typeof content === "string") return content;

  const blocks = Array.isArray(content) ? content : [content];
  const text = blocks
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .join("");

  // Blocks with no readable text (a tool call, an image) still carry meaning, so
  // keep them as JSON instead of sending an empty message.
  return text.length > 0 ? text : JSON.stringify(content);
}

/** Store an assistant turn that requested tool calls, keeping them verbatim. */
export function toStoredToolCallTurn(
  text: string | null,
  toolCalls: ChatCompletionMessageToolCall[],
): MessageContent {
  return { text: text ?? "", [TOOL_CALLS_KEY]: toolCalls };
}

/** Stored messages back to the array chat.completions.create takes. */
export function toChatMessages(dialogue: Dialogue): ChatCompletionMessageParam[] {
  return dialogue.messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: String(message.metadata?.toolCallId ?? ""),
        content: toMessageText(message.content),
      };
    }

    if (message.role === "assistant") {
      const toolCalls = readToolCalls(message.content);
      if (toolCalls) {
        return {
          role: "assistant",
          content: toMessageText(message.content),
          tool_calls: toolCalls,
        };
      }
      return { role: "assistant", content: toMessageText(message.content) };
    }

    if (message.role === "system") {
      return { role: "system", content: toMessageText(message.content) };
    }

    return { role: "user", content: toMessageText(message.content) };
  });
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
