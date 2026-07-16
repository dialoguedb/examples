/**
 * Demo — Exercises the Chat API and proves persistence across cold restarts
 *
 * This script:
 * 1. Starts a Koa server in-process
 * 2. Creates a chat, sends messages, and gets AI responses
 * 3. Simulates a cold restart by creating a fresh Koa instance
 * 4. Loads the chat from DialogueDB — full history is preserved
 * 5. Continues the conversation with full context
 *
 * Run:  npm run demo
 */

import http from "node:http";
import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import Anthropic from "@anthropic-ai/sdk";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
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
// App factory — creates a fresh Koa app backed by DialogueDB.
// Each call simulates a new server instance (cold start).
// ---------------------------------------------------------------------------

function createApp() {
  const db = new DialogueDB();
  const app = new Koa();
  const router = new Router();

  function toAnthropicMessages(dialogue: Dialogue) {
    return dialogue.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));
  }

  async function chat(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
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

  router.post("/chats", async (ctx) => {
    const { label, systemPrompt } = ctx.request.body as {
      label?: string;
      systemPrompt?: string;
    };
    const dialogue = await db.createDialogue({
      label,
      state: systemPrompt ? { systemPrompt } : undefined,
    });
    ctx.status = 201;
    ctx.body = { id: dialogue.id, label: label ?? null };
  });

  router.get("/chats", async (ctx) => {
    const { items } = await db.listDialogues();
    ctx.body = items.map((d) => ({ id: d.id, label: d.label }));
  });

  router.get("/chats/:id/messages", async (ctx) => {
    const dialogue = await db.getDialogue(ctx.params.id);
    if (!dialogue) {
      ctx.status = 404;
      ctx.body = { error: "Chat not found" };
      return;
    }
    await dialogue.loadMessages({ order: "asc" });
    ctx.body = dialogue.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  });

  router.post("/chats/:id/messages", async (ctx) => {
    const dialogue = await db.getDialogue(ctx.params.id);
    if (!dialogue) {
      ctx.status = 404;
      ctx.body = { error: "Chat not found" };
      return;
    }
    const { message } = ctx.request.body as { message?: string };
    if (!message) {
      ctx.status = 400;
      ctx.body = { error: "message is required" };
      return;
    }

    await dialogue.loadMessages({ order: "asc" });
    await dialogue.saveMessage({ role: "user", content: message });
    const state = dialogue.state as { systemPrompt?: string } | null;
    const reply = await chat(
      toAnthropicMessages(dialogue),
      state?.systemPrompt
    );
    await dialogue.saveMessage({ role: "assistant", content: reply });
    ctx.body = { role: "assistant", content: reply };
  });

  router.delete("/chats/:id", async (ctx) => {
    await db.deleteDialogue(ctx.params.id);
    ctx.body = { deleted: true };
  });

  app.use(bodyParser());
  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}

// ---------------------------------------------------------------------------
// Helper — start a Koa app on a random port, return the base URL and a close fn
// ---------------------------------------------------------------------------

function startServer(app: Koa): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(app.callback());
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("Bad address");
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

async function api(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, init);
  return res.json();
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB + Koa: Chat API Demo ===\n");

  // --- Server instance 1 ---
  console.log("--- Server instance 1 (initial) ---\n");
  const app1 = createApp();
  const srv1 = await startServer(app1);

  const created = (await api(srv1.url, "POST", "/chats", {
    label: "koa-demo",
    systemPrompt:
      "You are a concise travel assistant. Keep answers under 3 sentences.",
  })) as { id: string };
  console.log(`Created chat: ${created.id}\n`);

  const r1 = (await api(srv1.url, "POST", `/chats/${created.id}/messages`, {
    message:
      "Hi! My name is Priya. I'm planning a two-week trip to Japan in April. What regions should I prioritize?",
  })) as { content: string };
  console.log("[user] Hi! My name is Priya. I'm planning a trip to Japan...");
  console.log(`[assistant] ${r1.content}\n`);

  const r2 = (await api(srv1.url, "POST", `/chats/${created.id}/messages`, {
    message:
      "Great. I'm also interested in onsen towns and hiking. Any suggestions?",
  })) as { content: string };
  console.log("[user] I'm also interested in onsen towns and hiking...");
  console.log(`[assistant] ${r2.content}\n`);

  // Shut down the first server — all in-memory state is gone
  srv1.close();

  // --- Simulate cold restart ---
  console.log(
    "--- Server instance 2 (cold restart — new app, no in-memory state) ---\n"
  );
  const app2 = createApp();
  const srv2 = await startServer(app2);

  // List chats — they survived because DialogueDB persists them
  const chats = (await api(srv2.url, "GET", "/chats")) as Array<{
    id: string;
    label: string;
  }>;
  console.log(`Chats after restart: ${chats.length}`);
  for (const c of chats) {
    console.log(`  - ${c.id} (${c.label})`);
  }

  // Load message history — all messages are preserved
  const history = (await api(
    srv2.url,
    "GET",
    `/chats/${created.id}/messages`
  )) as Array<{ role: string; content: string }>;
  console.log(`\nMessages in chat: ${history.length}`);
  for (const m of history) {
    const preview =
      typeof m.content === "string"
        ? m.content.slice(0, 80)
        : JSON.stringify(m.content).slice(0, 80);
    console.log(`  [${m.role}] ${preview}...`);
  }

  // Continue the conversation — Claude has full context from before the restart
  console.log("\n--- Continuing conversation after restart ---\n");
  const r3 = (await api(srv2.url, "POST", `/chats/${created.id}/messages`, {
    message:
      "Quick recap: what's my name, where am I going, and what activities did we discuss?",
  })) as { content: string };
  console.log("[user] Quick recap: what's my name and what were we discussing?");
  console.log(`[assistant] ${r3.content}\n`);

  // Verify context was preserved
  const lower = r3.content.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("japan") ||
      lower.includes("onsen") ||
      lower.includes("hiking"));
  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);

  // Cleanup
  await api(srv2.url, "DELETE", `/chats/${created.id}`);
  srv2.close();
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
