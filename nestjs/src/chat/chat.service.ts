/**
 * ChatService — DialogueDB + OpenAI integration
 *
 * Wraps DialogueDB operations in a NestJS injectable service.
 * Each chat is a DialogueDB dialogue; every message is persisted
 * so conversations survive restarts and scale across instances.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import OpenAI from "openai";

const MODEL = "gpt-4o-mini";

@Injectable()
export class ChatService {
  private db = new DialogueDB();
  private openai = new OpenAI();

  async createChat(systemPrompt?: string) {
    const dialogue = await this.db.createDialogue({
      label: "nestjs-chat",
      state: systemPrompt ? { systemPrompt } : undefined,
      tags: ["nestjs"],
    });
    return { id: dialogue.id };
  }

  async sendMessage(chatId: string, message: string) {
    const dialogue = await this.db.getDialogue(chatId);
    if (!dialogue) throw new NotFoundException(`Chat ${chatId} not found`);

    await dialogue.loadMessages({ order: "asc" });

    // Persist user message before calling the LLM
    await dialogue.saveMessage({ role: "user", content: message });

    // Build messages array with optional system prompt from dialogue state
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    const state = dialogue.state;
    if (
      state &&
      typeof state === "object" &&
      "systemPrompt" in state &&
      typeof state.systemPrompt === "string"
    ) {
      messages.push({ role: "system", content: state.systemPrompt });
    }
    messages.push(...this.toOpenAIMessages(dialogue));

    const response = await this.openai.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages,
    });

    const reply = response.choices[0].message.content ?? "";

    // Persist assistant response with token usage metadata
    await dialogue.saveMessage({
      role: "assistant",
      content: reply,
      metadata: {
        model: response.model,
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
      },
    });

    return { role: "assistant" as const, content: reply };
  }

  async getMessages(chatId: string) {
    const dialogue = await this.db.getDialogue(chatId);
    if (!dialogue) throw new NotFoundException(`Chat ${chatId} not found`);

    await dialogue.loadMessages({ order: "asc" });
    return dialogue.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  async deleteChat(chatId: string) {
    await this.db.deleteDialogue(chatId);
  }

  private toOpenAIMessages(
    dialogue: Dialogue
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];
    for (const m of dialogue.messages) {
      if (m.role === "assistant") {
        result.push({ role: "assistant", content: String(m.content) });
      } else if (m.role === "user") {
        result.push({ role: "user", content: String(m.content) });
      }
    }
    return result;
  }
}
