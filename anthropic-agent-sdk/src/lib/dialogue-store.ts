/**
 * DialogueChatStore — Drop-in replacement for Anthropic's Simple Chat App ChatStore
 *
 * The simple-chatapp demo uses an in-memory Map for chat storage.
 * Their README says:
 *   "Replace the in-memory ChatStore with a database.
 *    Currently all chats are lost on server restart."
 *
 * This class replaces the Map with DialogueDB. Same interface, persistent storage.
 */

import { DialogueDB } from "dialogue-db";
import type { Dialogue, Message } from "dialogue-db";

export class DialogueChatStore {
  private db = new DialogueDB();

  /** Create a new chat. Returns the chat (Dialogue). */
  async createChat(label?: string): Promise<Dialogue> {
    return this.db.createDialogue({ label });
  }

  /** Get a chat by ID. Returns null if not found. */
  async getChat(id: string): Promise<Dialogue | null> {
    return this.db.getDialogue(id);
  }

  /** List all chats. Returns raw dialogue data (id, label, status, etc). */
  async getAllChats() {
    const { items } = await this.db.listDialogues();
    return items;
  }

  /** Add a message to a chat. */
  async addMessage(
    chatId: string,
    role: string,
    content: string
  ): Promise<Message> {
    const chat = await this.db.getDialogue(chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    return chat.saveMessage({ role, content });
  }

  /** Load all messages for a chat. */
  async getMessages(chatId: string): Promise<readonly Message[]> {
    const chat = await this.db.getDialogue(chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    await chat.loadMessages({ order: "asc" });
    return chat.messages;
  }

  /** Delete a chat and all its messages. */
  async deleteChat(id: string): Promise<void> {
    return this.db.deleteDialogue(id);
  }
}
