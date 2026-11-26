/**
 * Message conversion between DialogueDB and the Groq chat format.
 *
 * DialogueDB stores messages as { role, content, metadata }. Groq's API needs
 * specific shapes for assistant messages with tool_calls and for tool-role
 * messages, so those are stored as the full provider message shape in
 * DialogueDB's content field (which accepts string | object | array) and
 * reconstructed exactly on load.
 */

import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import type { Dialogue } from "dialogue-db";

export const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

/** Convert a loaded DialogueDB dialogue to the Groq message array. */
export function toGroqMessages(dialogue: Dialogue): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const m of dialogue.messages) {
    const c = m.content;
    if (m.metadata?.hasToolCalls && typeof c === "object" && "tool_calls" in c) {
      messages.push({
        role: "assistant",
        // Preserve null: String(null) would send the literal text "null".
        content: c.content == null ? null : String(c.content),
        tool_calls: c.tool_calls,
      });
    } else if (m.role === "tool" && typeof c === "object" && "tool_call_id" in c) {
      messages.push({
        role: "tool",
        tool_call_id: String(c.tool_call_id),
        content: String(c.content),
      });
    } else if (m.role === "user") {
      messages.push({ role: "user", content: String(m.content) });
    } else {
      messages.push({ role: "assistant", content: String(m.content) });
    }
  }

  return messages;
}
