/**
 * Demo — Exercises the GraphQL Chat API and proves persistence across cold restarts
 *
 * This script:
 * 1. Creates an Apollo Server instance backed by DialogueDB
 * 2. Runs GraphQL mutations to create a chat and exchange messages with GPT
 * 3. Simulates a cold restart by creating a fresh Apollo Server instance
 * 4. Queries messages from the new instance — full history is preserved
 * 5. Continues the conversation after the restart with full context
 *
 * Run:  npm run demo
 */

import { ApolloServer } from "@apollo/server";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import { typeDefs, createResolvers } from "./schema.js";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh Apollo Server instance. Each call simulates a new server (cold start). */
function createServer(): ApolloServer {
  return new ApolloServer({
    typeDefs,
    resolvers: createResolvers(new DialogueDB(), openai),
  });
}

/** Execute a GraphQL operation and return the data, throwing on errors. */
async function run(
  server: ApolloServer,
  query: string,
  variables?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result = await server.executeOperation({ query, variables });
  if (result.body.kind !== "single") throw new Error("Expected single result");
  const { data, errors } = result.body.singleResult;
  if (errors?.length) throw new Error(errors[0].message);
  if (!data) throw new Error("No data returned");
  return data;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB + GraphQL (Apollo Server): Chat API Demo ===\n");

  // --- Server instance 1 ---
  console.log("--- Server instance 1 (initial) ---\n");
  const server1 = createServer();
  await server1.start();

  // Create a chat with a custom system prompt
  const createData = await run(
    server1,
    `mutation CreateChat($label: String, $systemPrompt: String) {
      createChat(label: $label, systemPrompt: $systemPrompt) { id label }
    }`,
    { label: "graphql-demo", systemPrompt: "You are a concise cooking assistant. Keep answers under 3 sentences." }
  );
  const chat = createData.createChat as { id: string; label: string };
  console.log(`Created chat: ${chat.id}\n`);

  // First exchange
  const send1 = await run(
    server1,
    `mutation Send($chatId: ID!, $message: String!) {
      sendMessage(chatId: $chatId, message: $message) { role content }
    }`,
    { chatId: chat.id, message: "Hi! My name is Marco. I want to make fresh pasta for the first time. What flour should I use?" }
  );
  const reply1 = send1.sendMessage as { role: string; content: string };
  console.log("[user] Hi! My name is Marco. I want to make fresh pasta...");
  console.log(`[assistant] ${reply1.content}\n`);

  // Second exchange
  const send2 = await run(
    server1,
    `mutation Send($chatId: ID!, $message: String!) {
      sendMessage(chatId: $chatId, message: $message) { role content }
    }`,
    { chatId: chat.id, message: "Great. What ratio of eggs to flour do you recommend?" }
  );
  const reply2 = send2.sendMessage as { role: string; content: string };
  console.log("[user] What ratio of eggs to flour do you recommend?");
  console.log(`[assistant] ${reply2.content}\n`);

  // Shut down server instance 1
  await server1.stop();

  // --- Simulate cold restart ---
  console.log("--- Server instance 2 (cold restart — new server, no in-memory state) ---\n");
  const server2 = createServer();
  await server2.start();

  // List chats — they survived because DialogueDB persists them
  const listData = await run(server2, `query { chats { id label } }`);
  const chats = listData.chats as Array<{ id: string; label: string }>;
  console.log(`Chats after restart: ${chats.length}`);
  for (const c of chats) {
    console.log(`  - ${c.id} (${c.label})`);
  }

  // Load message history — all messages are preserved
  const historyData = await run(
    server2,
    `query Messages($chatId: ID!) {
      messages(chatId: $chatId) { role content }
    }`,
    { chatId: chat.id }
  );
  const history = historyData.messages as Array<{ role: string; content: string }>;
  console.log(`\nMessages in chat: ${history.length}`);
  for (const m of history) {
    console.log(`  [${m.role}] ${m.content.slice(0, 80)}...`);
  }

  // Continue the conversation — GPT has full context from before the restart
  console.log("\n--- Continuing conversation after restart ---\n");
  const send3 = await run(
    server2,
    `mutation Send($chatId: ID!, $message: String!) {
      sendMessage(chatId: $chatId, message: $message) { role content }
    }`,
    { chatId: chat.id, message: "Quick recap: what's my name and what were we discussing? Then tell me how long to knead the dough." }
  );
  const reply3 = send3.sendMessage as { role: string; content: string };
  console.log("[user] Quick recap: what's my name and what were we discussing?");
  console.log(`[assistant] ${reply3.content}\n`);

  // Verify context was preserved
  const lower = reply3.content.toLowerCase();
  const remembered =
    lower.includes("marco") &&
    (lower.includes("pasta") || lower.includes("flour") || lower.includes("dough"));
  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);

  // Cleanup
  await run(
    server2,
    `mutation Delete($id: ID!) { deleteChat(id: $id) }`,
    { id: chat.id }
  );
  await server2.stop();
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
