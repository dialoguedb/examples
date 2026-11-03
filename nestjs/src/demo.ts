/**
 * Demo — Exercises the Chat API and proves persistence across cold restarts
 *
 * 1. Boots a NestJS server, creates a chat, has a multi-turn conversation
 * 2. Shuts down and starts a fresh server (simulating a cold restart)
 * 3. Loads the chat from DialogueDB — full history is preserved
 * 4. Continues the conversation with full context
 *
 * Run:  npm run demo
 */

import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { setGlobalConfig } from "dialogue-db";
import { AppModule } from "./app.module.js";
import type { INestApplication } from "@nestjs/common";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const PORT = 3456;
const BASE = `http://localhost:${PORT}`;

async function startApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(PORT);
  return app;
}

async function call(
  method: string,
  path: string,
  body?: Record<string, string>
): Promise<Response> {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return fetch(`${BASE}${path}`, init);
}

async function main() {
  console.log("=== DialogueDB + NestJS: Chat API Demo ===\n");

  // --- Server instance 1 ---
  console.log("--- Server instance 1 (initial) ---\n");
  let app = await startApp();

  const createRes = await call("POST", "/chats", {
    label: "nestjs-demo",
    systemPrompt:
      "You are a concise travel advisor. Keep answers under 3 sentences.",
  });
  const created: { id: string } = await createRes.json();
  console.log(`Created chat: ${created.id}\n`);

  // First exchange
  const r1Res = await call("POST", `/chats/${created.id}/messages`, {
    message:
      "Hi! I'm Sofia. I'm planning a two-week trip to Japan in spring. Where should I start?",
  });
  const r1: { content: string } = await r1Res.json();
  console.log(
    "[user] Hi! I'm Sofia. Planning a two-week trip to Japan in spring..."
  );
  console.log(`[assistant] ${r1.content}\n`);

  // Second exchange
  const r2Res = await call("POST", `/chats/${created.id}/messages`, {
    message: "I love traditional culture and great food. Should I include Kyoto?",
  });
  const r2: { content: string } = await r2Res.json();
  console.log(
    "[user] I love traditional culture and great food. Should I include Kyoto?"
  );
  console.log(`[assistant] ${r2.content}\n`);

  // --- Simulate cold restart ---
  await app.close();
  console.log(
    "--- Server instance 2 (cold restart — new app, no in-memory state) ---\n"
  );
  app = await startApp();

  // List chats — they survived the restart
  const chatsRes = await call("GET", "/chats");
  const chats: Array<{ id: string; label: string }> = await chatsRes.json();
  console.log(`Chats after restart: ${chats.length}`);
  for (const c of chats) console.log(`  - ${c.id} (${c.label})`);

  // Load message history — all messages are preserved
  const historyRes = await call("GET", `/chats/${created.id}/messages`);
  const history: Array<{ role: string; content: string }> =
    await historyRes.json();
  console.log(`\nMessages in chat: ${history.length}`);
  for (const m of history) {
    const preview =
      typeof m.content === "string"
        ? m.content.slice(0, 80)
        : JSON.stringify(m.content).slice(0, 80);
    console.log(`  [${m.role}] ${preview}...`);
  }

  // Continue the conversation — GPT has full context from before the restart
  console.log("\n--- Continuing conversation after restart ---\n");
  const r3Res = await call("POST", `/chats/${created.id}/messages`, {
    message:
      "Quick recap: what's my name and where am I going? Then suggest a day trip from Tokyo.",
  });
  const r3: { content: string } = await r3Res.json();
  console.log("[user] Quick recap: what's my name and where am I going?");
  console.log(`[assistant] ${r3.content}\n`);

  // Verify context was preserved
  const lower = r3.content.toLowerCase();
  const remembered =
    lower.includes("sofia") &&
    (lower.includes("japan") ||
      lower.includes("kyoto") ||
      lower.includes("tokyo"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );

  // Cleanup
  await call("DELETE", `/chats/${created.id}`);
  await app.close();
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
