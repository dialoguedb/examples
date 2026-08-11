/**
 * DialogueDB + GraphQL Yoga — Chat API
 *
 * A GraphQL API that manages AI conversations with persistent history.
 * GraphQL Yoga handles the schema and transport, DialogueDB stores conversation
 * history, and Claude provides AI responses.
 *
 * Start:  npm run dev
 * Open:   http://localhost:4000/graphql  (GraphiQL playground)
 */

import { createSchema, createYoga } from "graphql-yoga";
import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue, MessageContent } from "dialogue-db";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const anthropic = new Anthropic();
const db = new DialogueDB();
const MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contentToString(content: MessageContent): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function buildAnthropicMessages(
  dialogue: Dialogue
): Anthropic.Messages.MessageParam[] {
  const result: Anthropic.Messages.MessageParam[] = [];
  for (const m of dialogue.messages) {
    if (m.role === "user" || m.role === "assistant") {
      result.push({ role: m.role, content: contentToString(m.content) });
    }
  }
  return result;
}

async function getAIResponse(
  messages: Anthropic.Messages.MessageParam[],
  systemPrompt?: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// ---------------------------------------------------------------------------
// GraphQL Schema
// ---------------------------------------------------------------------------

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Chat {
      id: String!
      label: String
      status: String!
      created: String!
      totalMessages: Int
    }

    type Message {
      id: String!
      role: String!
      content: String!
      created: String!
    }

    type SearchResult {
      relevance: Float!
      message: Message!
    }

    type Query {
      """
      Get a single chat by ID.
      """
      chat(id: String!): Chat

      """
      List all chats.
      """
      chats: [Chat!]!

      """
      Get message history for a chat, in chronological order.
      """
      messages(chatId: String!): [Message!]!

      """
      Semantic search across all messages. DialogueDB finds messages
      whose meaning matches the query, not just keyword matches.
      """
      search(query: String!, limit: Int): [SearchResult!]!
    }

    type Mutation {
      """
      Create a new chat. Optionally set a label and system prompt.
      The system prompt is stored in DialogueDB's dialogue state,
      so it persists across server restarts.
      """
      createChat(label: String, systemPrompt: String): Chat!

      """
      Send a message and get an AI response. Both are persisted to
      DialogueDB before returning.
      """
      sendMessage(chatId: String!, message: String!): Message!

      """
      Delete a chat and all its messages.
      """
      deleteChat(id: String!): Boolean!
    }
  `,
  resolvers: {
    Query: {
      chat: async (_: unknown, args: { id: string }) => {
        const dialogue = await db.getDialogue(args.id);
        if (!dialogue) return null;
        return {
          id: dialogue.id,
          label: dialogue.label,
          status: dialogue.status,
          created: dialogue.created,
          totalMessages: dialogue.totalMessages,
        };
      },

      chats: async () => {
        // DialogueDB: list all dialogues — each one represents a chat session.
        const { items } = await db.listDialogues();
        return items.map((d) => ({
          id: d.id,
          label: d.label,
          status: d.status,
          created: d.created,
          totalMessages: d.totalMessages,
        }));
      },

      messages: async (_: unknown, args: { chatId: string }) => {
        const dialogue = await db.getDialogue(args.chatId);
        if (!dialogue) throw new Error(`Chat ${args.chatId} not found`);

        // DialogueDB: load all messages in chronological order.
        await dialogue.loadMessages({ order: "asc" });

        return dialogue.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: contentToString(m.content),
          created: m.created,
        }));
      },

      search: async (
        _: unknown,
        args: { query: string; limit?: number }
      ) => {
        // DialogueDB: semantic search across all stored messages.
        // Returns results ranked by relevance — meaning-based, not keyword.
        const response = await db.searchMessages(args.query, {
          limit: args.limit ?? 10,
        });
        return response.results.map((r) => ({
          relevance: r.relevance,
          message: {
            id: r.item.id,
            role: r.item.role,
            content: contentToString(r.item.content),
            created: r.item.created,
          },
        }));
      },
    },

    Mutation: {
      createChat: async (
        _: unknown,
        args: { label?: string; systemPrompt?: string }
      ) => {
        // DialogueDB: create a dialogue. The system prompt goes in dialogue
        // state so it survives restarts — no local storage needed.
        const dialogue = await db.createDialogue({
          label: args.label,
          state: args.systemPrompt
            ? { systemPrompt: args.systemPrompt }
            : undefined,
        });
        return {
          id: dialogue.id,
          label: dialogue.label,
          status: dialogue.status,
          created: dialogue.created,
          totalMessages: dialogue.totalMessages,
        };
      },

      sendMessage: async (
        _: unknown,
        args: { chatId: string; message: string }
      ) => {
        const dialogue = await db.getDialogue(args.chatId);
        if (!dialogue) throw new Error(`Chat ${args.chatId} not found`);

        // DialogueDB: load history so Claude gets the full conversation context.
        await dialogue.loadMessages({ order: "asc" });

        // DialogueDB: persist the user message before calling the LLM.
        await dialogue.saveMessage({ role: "user", content: args.message });

        const state = dialogue.state;
        const systemPrompt =
          typeof state.systemPrompt === "string"
            ? state.systemPrompt
            : undefined;

        const reply = await getAIResponse(
          buildAnthropicMessages(dialogue),
          systemPrompt
        );

        // DialogueDB: persist the assistant response. The full exchange is
        // now stored and will survive server restarts and deployments.
        const saved = await dialogue.saveMessage({
          role: "assistant",
          content: reply,
        });

        return {
          id: saved.id,
          role: saved.role,
          content: contentToString(saved.content),
          created: saved.created,
        };
      },

      deleteChat: async (_: unknown, args: { id: string }) => {
        await db.deleteDialogue(args.id);
        return true;
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const yoga = createYoga({ schema });
const server = createServer(yoga);
const port = parseInt(process.env.PORT ?? "4000");

server.listen(port, () => {
  console.log(`GraphQL API running at http://localhost:${port}/graphql`);
  console.log(`Open the URL above for the GraphiQL playground.\n`);
  console.log(`Example queries:`);
  console.log(`
  mutation {
    createChat(label: "my-chat", systemPrompt: "You are helpful.") {
      id
      label
    }
  }

  mutation {
    sendMessage(chatId: "<id>", message: "Hello!") {
      role
      content
    }
  }

  query {
    search(query: "greeting", limit: 5) {
      relevance
      message { role content }
    }
  }
`);
});
