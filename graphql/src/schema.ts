/**
 * GraphQL schema and resolvers — the bridge between GraphQL and DialogueDB.
 *
 * typeDefs defines the chat API surface. createResolvers() wires each
 * operation to DialogueDB for persistence and OpenAI for AI responses.
 */

import type OpenAI from "openai";
import type { DialogueDB, Dialogue } from "dialogue-db";

const MODEL = "gpt-4o-mini";

// ---------------------------------------------------------------------------
// GraphQL Schema
// ---------------------------------------------------------------------------

export const typeDefs = `#graphql
  type Chat {
    id: ID!
    label: String
  }

  type Message {
    role: String!
    content: String!
  }

  type Query {
    "List all chats"
    chats: [Chat!]!

    "Get message history for a chat"
    messages(chatId: ID!): [Message!]!
  }

  type Mutation {
    "Create a new chat. Optionally set a system prompt stored in dialogue state."
    createChat(label: String, systemPrompt: String): Chat!

    "Send a user message and get an AI response. Both are persisted."
    sendMessage(chatId: ID!, message: String!): Message!

    "Delete a chat and all its messages."
    deleteChat(id: ID!): Boolean!
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function messageContent(content: string | object | unknown[]): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function toOpenAIMessages(
  dialogue: Dialogue,
  systemPrompt: string | undefined
): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const m of dialogue.messages) {
    messages.push({
      role: m.role as "user" | "assistant",
      content: messageContent(m.content),
    });
  }
  return messages;
}

function getSystemPrompt(dialogue: Dialogue): string | undefined {
  const state = dialogue.state;
  if (state && typeof state === "object" && !Array.isArray(state)) {
    const s = state as Record<string, unknown>;
    return typeof s.systemPrompt === "string" ? s.systemPrompt : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Resolver factory
// ---------------------------------------------------------------------------

export function createResolvers(db: DialogueDB, openai: OpenAI) {
  return {
    Query: {
      chats: async () => {
        const { items } = await db.listDialogues();
        return items.map((d) => ({ id: d.id, label: d.label }));
      },

      messages: async (_: unknown, { chatId }: { chatId: string }) => {
        const dialogue = await db.getDialogue(chatId);
        if (!dialogue) throw new Error("Chat not found");
        await dialogue.loadMessages({ order: "asc" });
        return dialogue.messages.map((m) => ({
          role: m.role,
          content: messageContent(m.content),
        }));
      },
    },

    Mutation: {
      createChat: async (
        _: unknown,
        { label, systemPrompt }: { label?: string; systemPrompt?: string }
      ) => {
        const dialogue = await db.createDialogue({
          label,
          state: systemPrompt ? { systemPrompt } : undefined,
        });
        return { id: dialogue.id, label: label ?? null };
      },

      sendMessage: async (
        _: unknown,
        { chatId, message }: { chatId: string; message: string }
      ) => {
        const dialogue = await db.getDialogue(chatId);
        if (!dialogue) throw new Error("Chat not found");

        // DialogueDB: load full history so the LLM has context.
        await dialogue.loadMessages({ order: "asc" });

        // DialogueDB: persist the user message before calling the LLM.
        await dialogue.saveMessage({ role: "user", content: message });

        const systemPrompt = getSystemPrompt(dialogue);
        const response = await openai.chat.completions.create({
          model: MODEL,
          max_tokens: 1024,
          messages: toOpenAIMessages(dialogue, systemPrompt),
        });
        const reply = response.choices[0].message.content ?? "";

        // DialogueDB: persist the assistant response.
        await dialogue.saveMessage({ role: "assistant", content: reply });

        return { role: "assistant", content: reply };
      },

      deleteChat: async (_: unknown, { id }: { id: string }) => {
        await db.deleteDialogue(id);
        return true;
      },
    },
  };
}
