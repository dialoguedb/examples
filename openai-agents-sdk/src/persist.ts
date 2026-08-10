import { protocol } from "@openai/agents";
import type { AgentInputItem } from "@openai/agents";
import type { DialogueDB, MessageContent } from "dialogue-db";

/**
 * The bridge between an OpenAI Agents SDK conversation and DialogueDB.
 *
 * The loop is symmetric: `result.history` is `AgentInputItem[]`, and
 * `run(agent, input)` accepts `string | AgentInputItem[] | RunState`. So what
 * you persist is exactly what seeds the next run. There is no Session adapter
 * involved; this is explicit wiring you can read end to end.
 *
 * The one thing that must not be got wrong is the message mapping. An
 * AgentInputItem is a 17-member union, and only three members (user, assistant,
 * system messages) carry a `role` at all. Tool calls, tool results, and
 * reasoning carry none. Flattening to { role, content: string } would silently
 * destroy every tool call in the conversation, and the assistant variant would
 * be rejected on the way back in (its content must be an array, and `status` is
 * required). So we store the item verbatim.
 *
 * DialogueDB can hold it: MessageContent is
 * `string | Record<string, any> | Record<string, any>[]`, so a structured item
 * goes in as an object with no stringify and no lossy re-parse.
 */

/**
 * The `role` column is a coarse label for readability in DialogueDB. The item
 * itself is the source of truth and is what we reconstruct from, so items with
 * no role of their own are stored under "assistant" rather than inventing one.
 */
function labelRoleFor(item: AgentInputItem): string {
  return "role" in item && typeof item.role === "string"
    ? item.role
    : "assistant";
}

export function toStoredMessages(
  items: AgentInputItem[],
): { role: string; content: MessageContent }[] {
  return items.map((item) => ({ role: labelRoleFor(item), content: item }));
}

/**
 * Rebuild the run input from stored rows. protocol.ModelItem is the Zod schema
 * the SDK itself uses for these items, so this validates as it parses and needs
 * no type assertion.
 */
export function fromStoredMessages(
  rows: readonly { content: unknown }[],
): AgentInputItem[] {
  return rows.map((row) => protocol.ModelItem.parse(row.content));
}

/**
 * Namespace placement is not uniform in the DialogueDB SDK: some calls take it
 * as a field on the input object, others as a field on a second options
 * argument, and every one of them is optional. Putting it in the wrong place
 * compiles cleanly and silently reads or writes the default namespace, which
 * across users is a data leak. These helpers are the only place namespace is
 * threaded, so a caller cannot misplace it.
 */
export function conversationStore(db: DialogueDB, namespace: string) {
  return {
    /** Load prior history for this user, ready to pass straight into run(). */
    async loadHistory(dialogueId: string): Promise<AgentInputItem[]> {
      const dialogue = await db.getDialogue(dialogueId, { namespace });
      if (!dialogue) return [];
      // loadMessages replaces the local cache; the accumulated set is on
      // dialogue.messages, not the return value.
      await dialogue.loadMessages({ order: "asc" });
      return fromStoredMessages(dialogue.messages);
    },

    /** Persist the items this run added, in order. */
    async appendItems(
      dialogueId: string,
      items: AgentInputItem[],
    ): Promise<void> {
      if (items.length === 0) return;
      const dialogue = await db.getOrCreateDialogue({
        id: dialogueId,
        namespace,
      });
      await dialogue.saveMessages(toStoredMessages(items));
    },

    /**
     * Facts worth remembering across conversations. The caller decides.
     * Passing a stable id keeps repeat runs idempotent instead of stacking
     * duplicate copies of the same fact in the namespace.
     */
    async rememberFact(id: string, value: string): Promise<void> {
      await db.createMemory({ id, value, namespace });
    },

    async forgetFact(id: string): Promise<void> {
      await db.deleteMemory(id, { namespace });
    },

    /** Search this user's memories by meaning. Returns the memory values. */
    async recallFacts(query: string, limit = 3): Promise<string[]> {
      const response = await db.searchMemories(query, { namespace, limit });
      return response.results.map((result) => String(result.item.value));
    },

    async deleteConversation(dialogueId: string): Promise<void> {
      await db.deleteDialogue(dialogueId, { namespace });
    },
  };
}
