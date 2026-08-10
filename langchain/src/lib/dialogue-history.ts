/**
 * DialogueChatHistory — Drop-in LangChain ChatMessageHistory backed by DialogueDB
 *
 * LangChain's built-in memory classes (BufferMemory, ConversationSummaryMemory, etc.)
 * all delegate to a ChatMessageHistory for storage. The default is in-memory — lost on
 * restart. This class replaces it with DialogueDB for persistent, cross-process storage.
 *
 * Implements the BaseListChatMessageHistory interface so it works with any LangChain
 * memory class or chain that accepts a message history.
 */

import { BaseListChatMessageHistory } from "@langchain/core/chat_history";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

export class DialogueChatHistory extends BaseListChatMessageHistory {
  lc_namespace = ["langchain", "stores", "message", "dialoguedb"];

  private db = new DialogueDB();
  private dialogue: Dialogue | null = null;
  private dialogueId: string | null;
  private label: string | undefined;
  private namespace: string | undefined;

  /**
   * @param opts.dialogueId - The dialogue (session) id. Resumed if it already
   *   exists, created if it does not, so a caller-supplied session id works on
   *   the first turn and every turn after. If omitted, a new dialogue is
   *   created and its id is available from getDialogueId() after first use.
   * @param opts.label - Optional label for a newly created dialogue (when no
   *   dialogueId is given). Ignored when a dialogueId is supplied.
   * @param opts.namespace - Isolates this history to one user, tenant, or workspace.
   *   Threaded through every DialogueDB call so nothing leaks across namespaces.
   *   Omit for the default namespace.
   */
  constructor(opts: { dialogueId?: string; label?: string; namespace?: string } = {}) {
    super();
    this.dialogueId = opts.dialogueId ?? null;
    this.label = opts.label;
    this.namespace = opts.namespace;
  }

  /** Ensure the dialogue is loaded/created. */
  private async ensureDialogue(): Promise<Dialogue> {
    if (this.dialogue) return this.dialogue;

    if (this.dialogueId) {
      // Resume the session if it exists, create it if not, keyed by the id.
      this.dialogue = await this.db.getOrCreateDialogue({
        id: this.dialogueId,
        namespace: this.namespace,
      });
    } else {
      // No id supplied: create a fresh dialogue, optionally labelled.
      this.dialogue = await this.db.createDialogue({
        label: this.label,
        namespace: this.namespace,
      });
    }
    this.dialogueId = this.dialogue.id;

    return this.dialogue;
  }

  /** Get the underlying DialogueDB dialogue ID (available after first use). */
  getDialogueId(): string | null {
    return this.dialogueId;
  }

  /** Load all messages from DialogueDB and convert to LangChain format. */
  async getMessages(): Promise<BaseMessage[]> {
    const dialogue = await this.ensureDialogue();
    await dialogue.loadMessages({ order: "asc" });

    return dialogue.messages.map((m) => {
      // DialogueDB content is string | Record | Record[]. A dialogue is shared
      // across SDKs, so structured content written elsewhere shows up here.
      // LangChain reads a non-string argument as BaseMessageFields, which would
      // silently leave content undefined, so serialize it the way addMessage does.
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      switch (m.role) {
        case "user":
          return new HumanMessage(content);
        case "assistant":
          return new AIMessage(content);
        case "system":
          return new SystemMessage(content);
        default:
          return new HumanMessage(content);
      }
    });
  }

  /** Persist a single message to DialogueDB. */
  async addMessage(message: BaseMessage): Promise<void> {
    const dialogue = await this.ensureDialogue();

    let role: string;
    if (message._getType() === "human") role = "user";
    else if (message._getType() === "ai") role = "assistant";
    else if (message._getType() === "system") role = "system";
    else role = "user";

    await dialogue.saveMessage({
      role,
      content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
    });
  }

  /** Clear all messages by deleting and recreating the dialogue. */
  async clear(): Promise<void> {
    if (this.dialogueId) {
      await this.db.deleteDialogue(this.dialogueId, { namespace: this.namespace });
    }
    this.dialogue = null;
    this.dialogueId = null;
  }
}
