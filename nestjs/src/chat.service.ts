/**
 * DialogueDB + OpenAI — wrapped as a NestJS injectable service.
 *
 * DialogueDB stores every dialogue and message so the NestJS process can
 * restart, scale horizontally, or redeploy without losing conversation state.
 */

import { Injectable } from "@nestjs/common";
import { DialogueDB } from "dialogue-db";
import OpenAI from "openai";

@Injectable()
export class ChatService {
  private readonly db = new DialogueDB();
  private readonly openai = new OpenAI();
  private readonly model = "gpt-4o-mini";

  async createChat(label?: string, systemPrompt?: string) {
    const dialogue = await this.db.createDialogue({
      label,
      state: systemPrompt ? { systemPrompt } : undefined,
    });
    return { id: dialogue.id, label: label ?? null };
  }

  async listChats() {
    const { items } = await this.db.listDialogues();
    return items.map((d) => ({ id: d.id, label: d.label }));
  }

  async getMessages(chatId: string) {
    const dialogue = await this.db.getDialogue(chatId);
    if (!dialogue) return null;

    await dialogue.loadMessages({ order: "asc" });
    return dialogue.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  async sendMessage(chatId: string, message: string) {
    const dialogue = await this.db.getDialogue(chatId);
    if (!dialogue) return null;

    // Load existing history so the LLM has full context
    await dialogue.loadMessages({ order: "asc" });

    // Persist the user message before calling the LLM
    await dialogue.saveMessage({ role: "user", content: message });

    // Build the OpenAI message array from DialogueDB history
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    const state = dialogue.state;
    if (
      state &&
      typeof state === "object" &&
      "systemPrompt" in state &&
      typeof state.systemPrompt === "string"
    ) {
      openaiMessages.push({ role: "system", content: state.systemPrompt });
    }

    for (const m of dialogue.messages) {
      openaiMessages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content),
      });
    }

    const response = await this.openai.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      messages: openaiMessages,
    });
    const reply = response.choices[0]?.message.content ?? "";

    // Persist the assistant response — survives restarts and deployments
    await dialogue.saveMessage({ role: "assistant", content: reply });

    return { role: "assistant", content: reply };
  }

  async deleteChat(chatId: string) {
    await this.db.deleteDialogue(chatId);
  }
}
