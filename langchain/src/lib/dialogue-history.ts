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
  private label: string;

  /**
   * @param opts.dialogueId - Resume an existing dialogue. If omitted, a new one is created.
   * @param opts.label - Label for new dialogues (ignored when resuming).
   */
  constructor(opts: { dialogueId?: string; label?: string } = {}) {
    super();
    this.dialogueId = opts.dialogueId ?? null;
    this.label = opts.label ?? "langchain-session";
  }

  /** Ensure the dialogue is loaded/created. */
  private async ensureDialogue(): Promise<Dialogue> {
    if (this.dialogue) return this.dialogue;

    if (this.dialogueId) {
      const d = await this.db.getDialogue(this.dialogueId);
      if (!d) throw new Error(`Dialogue ${this.dialogueId} not found`);
      this.dialogue = d;
    } else {
      this.dialogue = await this.db.createDialogue({ label: this.label });
      this.dialogueId = this.dialogue.id;
    }

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
      const content = m.content as string;
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
      await this.db.deleteDialogue(this.dialogueId);
    }
    this.dialogue = null;
    this.dialogueId = null;
  }
}
