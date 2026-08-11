/**
 * Demo — Exercises the GraphQL API and proves persistence across cold restarts
 *
 * This script:
 * 1. Creates a GraphQL Yoga instance backed by DialogueDB
 * 2. Runs mutations to create a chat and send messages
 * 3. Simulates a cold restart with a fresh instance
 * 4. Queries messages — full history is preserved
 * 5. Continues the conversation — Claude has full context
 * 6. Runs a semantic search across all stored messages
 *
 * Run:  npm run demo
 */

import { createSchema, createYoga } from "graphql-yoga";
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
const MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// App factory — each call creates a fresh GraphQL API backed by DialogueDB.
// Simulates independent server instances (cold starts).
// ---------------------------------------------------------------------------

function createApp() {
  const db = new DialogueDB();

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
        chat(id: String!): Chat
        chats: [Chat!]!
        messages(chatId: String!): [Message!]!
        search(query: String!, limit: Int): [SearchResult!]!
      }

      type Mutation {
        createChat(label: String, systemPrompt: String): Chat!
        sendMessage(chatId: String!, message: String!): Message!
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
          await dialogue.loadMessages({ order: "asc" });
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

  return createYoga({ schema });
}

// ---------------------------------------------------------------------------
// Helper — execute a GraphQL operation against a yoga instance
// ---------------------------------------------------------------------------

async function gql(
  yoga: ReturnType<typeof createYoga>,
  query: string,
  variables?: Record<string, unknown>
) {
  const response = await yoga.fetch("http://yoga/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB + GraphQL Yoga: Chat API Demo ===\n");

  // --- Instance 1 ---
  console.log("--- GraphQL instance 1 (initial) ---\n");
  const app1 = createApp();

  // Create a chat
  const createResult = await gql(
    app1,
    `mutation CreateChat($label: String, $systemPrompt: String) {
      createChat(label: $label, systemPrompt: $systemPrompt) {
        id label status
      }
    }`,
    {
      label: "graphql-demo",
      systemPrompt:
        "You are a concise travel guide. Keep answers under 3 sentences.",
    }
  );
  const chatId = createResult.createChat.id;
  console.log(`Created chat: ${chatId}\n`);

  // First exchange
  const r1 = await gql(
    app1,
    `mutation Send($chatId: String!, $message: String!) {
      sendMessage(chatId: $chatId, message: $message) {
        role content
      }
    }`,
    {
      chatId,
      message:
        "Hi! My name is Priya. I'm planning a trip to Kyoto in autumn. What should I not miss?",
    }
  );
  console.log("[user] Hi! My name is Priya. I'm planning a trip to Kyoto...");
  console.log(`[assistant] ${r1.sendMessage.content}\n`);

  // Second exchange
  const r2 = await gql(
    app1,
    `mutation Send($chatId: String!, $message: String!) {
      sendMessage(chatId: $chatId, message: $message) {
        role content
      }
    }`,
    { chatId, message: "I love temples. Which ones have the best gardens?" }
  );
  console.log("[user] I love temples. Which ones have the best gardens?");
  console.log(`[assistant] ${r2.sendMessage.content}\n`);

  // --- Simulate cold restart ---
  console.log(
    "--- GraphQL instance 2 (cold restart — fresh instance, no in-memory state) ---\n"
  );
  const app2 = createApp();

  // List chats — they survived because DialogueDB persists them
  const listResult = await gql(app2, `{ chats { id label } }`);
  console.log(`Chats after restart: ${listResult.chats.length}`);
  for (const c of listResult.chats) {
    console.log(`  - ${c.id} (${c.label})`);
  }

  // Load message history
  const historyResult = await gql(
    app2,
    `query Messages($chatId: String!) {
      messages(chatId: $chatId) { role content }
    }`,
    { chatId }
  );
  console.log(`\nMessages in chat: ${historyResult.messages.length}`);
  for (const m of historyResult.messages) {
    const preview = m.content.slice(0, 80);
    console.log(`  [${m.role}] ${preview}...`);
  }

  // Continue the conversation — Claude has full context from before the restart
  console.log("\n--- Continuing conversation after restart ---\n");
  const r3 = await gql(
    app2,
    `mutation Send($chatId: String!, $message: String!) {
      sendMessage(chatId: $chatId, message: $message) {
        role content
      }
    }`,
    {
      chatId,
      message:
        "Quick recap: what's my name and what were we discussing? Then suggest a good time of day to visit.",
    }
  );
  console.log(
    "[user] Quick recap: what's my name and what were we discussing?"
  );
  console.log(`[assistant] ${r3.sendMessage.content}\n`);

  // Verify context was preserved
  const lower = r3.sendMessage.content.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("kyoto") ||
      lower.includes("temple") ||
      lower.includes("garden"));
  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);

  // --- Semantic search ---
  console.log("\n--- Semantic search across all messages ---\n");
  const searchResult = await gql(
    app2,
    `query Search($query: String!, $limit: Int) {
      search(query: $query, limit: $limit) {
        relevance
        message { role content }
      }
    }`,
    { query: "Japanese gardens and nature", limit: 3 }
  );
  console.log(`Search for "Japanese gardens and nature":`);
  for (const hit of searchResult.search) {
    const preview = hit.message.content.slice(0, 100);
    console.log(
      `  [${hit.relevance.toFixed(2)}] [${hit.message.role}] ${preview}...`
    );
  }

  // Cleanup
  await gql(
    app2,
    `mutation Delete($id: String!) { deleteChat(id: $id) }`,
    { id: chatId }
  );
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
