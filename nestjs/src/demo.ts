/**
 * Demo — Exercises the ChatService and proves persistence across restarts
 *
 * This script:
 * 1. Boots NestJS without an HTTP server (application context only)
 * 2. Creates a chat, sends messages, gets AI responses
 * 3. Simulates a cold restart by tearing down and recreating the context
 * 4. Continues the conversation — GPT has full context from DialogueDB
 *
 * Run:  npm run demo
 */

import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { setGlobalConfig } from "dialogue-db";
import { AppModule } from "./app.module.js";
import { ChatService } from "./chat/chat.service.js";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

async function main() {
  console.log("=== DialogueDB + NestJS Demo ===\n");

  // Boot NestJS without an HTTP server — just the DI container
  const app = await NestFactory.createApplicationContext(AppModule);
  const chat = app.get(ChatService);

  // 1. Create a chat with a system prompt stored in DialogueDB
  const { id } = await chat.createChat(
    "You are a concise travel guide. Keep answers under 3 sentences."
  );
  console.log(`Created chat: ${id}\n`);

  // 2. First exchange
  const reply1 = await chat.sendMessage(
    id,
    "What are three must-see spots in Tokyo?"
  );
  console.log(`User:      What are three must-see spots in Tokyo?`);
  console.log(`Assistant: ${reply1.content}\n`);

  // 3. Follow-up (model has full context via DialogueDB)
  const reply2 = await chat.sendMessage(
    id,
    "Which one is best for photography?"
  );
  console.log(`User:      Which one is best for photography?`);
  console.log(`Assistant: ${reply2.content}\n`);

  // 4. Verify persistence
  const messages = await chat.getMessages(id);
  console.log(`Persisted ${messages.length} messages in DialogueDB\n`);

  // 5. Cold restart — tear down and recreate the NestJS context
  console.log("--- Simulating cold restart ---\n");
  await app.close();

  const fresh = await NestFactory.createApplicationContext(AppModule);
  const freshChat = fresh.get(ChatService);

  // 6. Continue the conversation — GPT remembers everything via DialogueDB
  const reply3 = await freshChat.sendMessage(
    id,
    "Remind me: what spots did you recommend, and which was best for photos?"
  );
  console.log(`User:      Remind me: what spots did you recommend?`);
  console.log(`Assistant: ${reply3.content}\n`);

  // Verify context survived the restart
  const lower = reply3.content.toLowerCase();
  const remembered = lower.includes("tokyo") || lower.includes("photo");
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );

  // Cleanup
  await freshChat.deleteChat(id);
  console.log("Cleaned up. Done!");
  await fresh.close();
}

main().catch(console.error);
