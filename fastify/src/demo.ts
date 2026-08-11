/**
 * Demo — Exercises the Chat API and proves persistence across cold restarts
 *
 * This script:
 * 1. Starts a Fastify instance in-process (no HTTP port needed — uses inject)
 * 2. Creates a chat, sends messages, and gets AI responses
 * 3. Simulates a cold restart by creating a fresh Fastify instance
 * 4. Loads the chat from DialogueDB — full history is preserved
 * 5. Continues the conversation with full context
 *
 * Run:  npm run demo
 */

import Fastify, { type FastifyInstance } from "fastify";
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
// App factory — creates a fresh Fastify app backed by DialogueDB.
// Each call simulates a new server instance (cold start).
// ---------------------------------------------------------------------------

function createApp(): FastifyInstance {
  const db = new DialogueDB();
  const app = Fastify();

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

  app.post<{ Body: { label?: string; systemPrompt?: string } }>(
    "/chats",
    async (request, reply) => {
      const { label, systemPrompt } = request.body;
      const dialogue = await db.createDialogue({
        label,
        state: systemPrompt ? { systemPrompt } : undefined,
      });
      return reply.code(201).send({ id: dialogue.id, label: label ?? null });
    }
  );

  app.get("/chats", async () => {
    const { items } = await db.listDialogues();
    return items.map((d) => ({ id: d.id, label: d.label }));
  });

  app.get<{ Params: { id: string } }>(
    "/chats/:id/messages",
    async (request, reply) => {
      const dialogue = await db.getDialogue(request.params.id);
      if (!dialogue) return reply.code(404).send({ error: "Chat not found" });
      await dialogue.loadMessages({ order: "asc" });
      return dialogue.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    }
  );

  app.post<{ Params: { id: string }; Body: { message: string } }>(
    "/chats/:id/messages",
    async (request, reply) => {
      const dialogue = await db.getDialogue(request.params.id);
      if (!dialogue) return reply.code(404).send({ error: "Chat not found" });
      const { message } = request.body;
      if (!message) return reply.code(400).send({ error: "message is required" });

      await dialogue.loadMessages({ order: "asc" });
      await dialogue.saveMessage({ role: "user", content: message });
      const systemPrompt = (dialogue.state as { systemPrompt?: string })
        ?.systemPrompt;
      const replyText = await chat(toAnthropicMessages(dialogue), systemPrompt);
      await dialogue.saveMessage({ role: "assistant", content: replyText });
      return { role: "assistant", content: replyText };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/chats/:id",
    async (request) => {
      await db.deleteDialogue(request.params.id);
      return { deleted: true };
    }
  );

  return app;
}

// ---------------------------------------------------------------------------
// Helper — call the Fastify app using inject (no HTTP server needed)
// ---------------------------------------------------------------------------

async function call(
  app: FastifyInstance,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<unknown> {
  const response = await app.inject({
    method,
    url: path,
    ...(body ? { payload: body } : {}),
  });
  return JSON.parse(response.body);
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB + Fastify: Chat API Demo ===\n");

  // --- Server instance 1 ---
  console.log("--- Server instance 1 (initial) ---\n");
  const app1 = createApp();
  await app1.ready();

  // Create a chat with a custom system prompt
  const created = (await call(app1, "POST", "/chats", {
    label: "fastify-demo",
    systemPrompt:
      "You are a concise cooking assistant. Keep answers under 3 sentences.",
  })) as { id: string };
  console.log(`Created chat: ${created.id}\n`);

  // First exchange
  const r1 = (await call(app1, "POST", `/chats/${created.id}/messages`, {
    message:
      "Hi! My name is Marco. I want to make fresh pasta for the first time. What flour should I use?",
  })) as { content: string };
  console.log(`[user] Hi! My name is Marco. I want to make fresh pasta...`);
  console.log(`[assistant] ${r1.content}\n`);

  // Second exchange
  const r2 = (await call(app1, "POST", `/chats/${created.id}/messages`, {
    message: "Great. What ratio of eggs to flour do you recommend?",
  })) as { content: string };
  console.log(`[user] What ratio of eggs to flour do you recommend?`);
  console.log(`[assistant] ${r2.content}\n`);

  // Close instance 1
  await app1.close();

  // --- Simulate cold restart ---
  console.log(
    "--- Server instance 2 (cold restart — new app, no in-memory state) ---\n"
  );
  const app2 = createApp();
  await app2.ready();

  // List chats — they survived the restart because DialogueDB persists them
  const chats = (await call(app2, "GET", "/chats")) as Array<{
    id: string;
    label: string;
  }>;
  console.log(`Chats after restart: ${chats.length}`);
  for (const c of chats) {
    console.log(`  - ${c.id} (${c.label})`);
  }

  // Load message history — all messages are preserved
  const history = (await call(
    app2,
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
  const r3 = (await call(app2, "POST", `/chats/${created.id}/messages`, {
    message:
      "Quick recap: what's my name and what were we discussing? Then tell me how long to knead the dough.",
  })) as { content: string };
  console.log(
    `[user] Quick recap: what's my name and what were we discussing?`
  );
  console.log(`[assistant] ${r3.content}\n`);

  // Verify context was preserved
  const lower = r3.content.toLowerCase();
  const remembered =
    lower.includes("marco") &&
    (lower.includes("pasta") ||
      lower.includes("flour") ||
      lower.includes("dough"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );

  // Cleanup
  await call(app2, "DELETE", `/chats/${created.id}`);
  await app2.close();
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
