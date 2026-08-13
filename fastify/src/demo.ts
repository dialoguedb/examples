/**
 * Demo — Exercises the Chat API and proves persistence across cold restarts
 *
 * This script:
 * 1. Spins up a Fastify app in-process (no HTTP server)
 * 2. Creates a chat, sends messages, and gets AI responses
 * 3. Simulates a cold restart by creating a fresh Fastify instance
 * 4. Loads the chat from DialogueDB — full history is preserved
 * 5. Continues the conversation with full context
 *
 * Uses Fastify's built-in inject() for in-process request testing.
 *
 * Run:  npm run demo
 */

import Fastify, { type FastifyInstance } from "fastify";
import OpenAI from "openai";
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

const openai = new OpenAI();
const MODEL = "gpt-4o";

// ---------------------------------------------------------------------------
// App factory — creates a fresh Fastify app backed by DialogueDB.
// Each call simulates a new server instance (cold start).
// ---------------------------------------------------------------------------

async function createApp(): Promise<FastifyInstance> {
  const db = new DialogueDB();
  const app = Fastify({ logger: false });

  function toChatMessages(
    dialogue: Dialogue
  ): Array<OpenAI.ChatCompletionMessageParam> {
    const messages: Array<OpenAI.ChatCompletionMessageParam> = [];
    for (const m of dialogue.messages) {
      if (m.role === "user" || m.role === "assistant") {
        messages.push({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        });
      }
    }
    return messages;
  }

  function getSystemPrompt(state: unknown): string | undefined {
    if (state && typeof state === "object" && "systemPrompt" in state) {
      return typeof state.systemPrompt === "string"
        ? state.systemPrompt
        : undefined;
    }
    return undefined;
  }

  async function chat(
    messages: Array<OpenAI.ChatCompletionMessageParam>,
    systemPrompt?: string
  ): Promise<string> {
    const allMessages: Array<OpenAI.ChatCompletionMessageParam> = [];
    if (systemPrompt) {
      allMessages.push({ role: "system", content: systemPrompt });
    }
    allMessages.push(...messages);
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages: allMessages,
    });
    return completion.choices[0]?.message?.content ?? "";
  }

  app.post<{ Body: { label?: string; systemPrompt?: string } }>(
    "/chats",
    async (request, reply) => {
      const { label, systemPrompt } = request.body;
      const dialogue = await db.createDialogue({
        label,
        state: systemPrompt ? { systemPrompt } : undefined,
      });
      reply.code(201);
      return { id: dialogue.id, label: label ?? null };
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
      if (!dialogue) {
        reply.code(404);
        return { error: "Chat not found" };
      }
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
      if (!dialogue) {
        reply.code(404);
        return { error: "Chat not found" };
      }
      const { message } = request.body;
      await dialogue.loadMessages({ order: "asc" });
      await dialogue.saveMessage({ role: "user", content: message });
      const systemPrompt = getSystemPrompt(dialogue.state);
      const replyText = await chat(toChatMessages(dialogue), systemPrompt);
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

  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Helper — call the Fastify app via inject (no HTTP server needed)
// ---------------------------------------------------------------------------

async function call(
  app: FastifyInstance,
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: unknown
): Promise<unknown> {
  const response = await app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
  });
  return response.json();
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB + Fastify: Chat API Demo ===\n");

  // --- Server instance 1 ---
  console.log("--- Server instance 1 (initial) ---\n");
  const app1 = await createApp();

  const created = (await call(app1, "POST", "/chats", {
    label: "fastify-demo",
    systemPrompt:
      "You are a concise travel advisor. Keep answers under 3 sentences.",
  })) as { id: string };
  console.log(`Created chat: ${created.id}\n`);

  // First exchange
  const r1 = (await call(app1, "POST", `/chats/${created.id}/messages`, {
    message:
      "Hi! My name is Elena. I'm planning a two-week trip to Japan in autumn. What regions should I prioritize?",
  })) as { content: string };
  console.log(
    `[user] Hi! My name is Elena. I'm planning a trip to Japan in autumn...`
  );
  console.log(`[assistant] ${r1.content}\n`);

  // Second exchange
  const r2 = (await call(app1, "POST", `/chats/${created.id}/messages`, {
    message:
      "Great advice. What about the food scene — any must-try regional dishes?",
  })) as { content: string };
  console.log(`[user] What about the food scene — any must-try regional dishes?`);
  console.log(`[assistant] ${r2.content}\n`);

  await app1.close();

  // --- Simulate cold restart ---
  console.log(
    "--- Server instance 2 (cold restart — new app, no in-memory state) ---\n"
  );
  const app2 = await createApp();

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

  // Continue the conversation — the LLM has full context from before the restart
  console.log("\n--- Continuing conversation after restart ---\n");
  const r3 = (await call(app2, "POST", `/chats/${created.id}/messages`, {
    message:
      "Quick recap: what's my name and what were we discussing? Then suggest a day trip from Tokyo.",
  })) as { content: string };
  console.log(
    `[user] Quick recap: what's my name and what were we discussing?`
  );
  console.log(`[assistant] ${r3.content}\n`);

  // Verify context was preserved
  const lower = r3.content.toLowerCase();
  const remembered =
    lower.includes("elena") &&
    (lower.includes("japan") ||
      lower.includes("autumn") ||
      lower.includes("travel"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );

  // Cleanup
  await call(app2, "DELETE", `/chats/${created.id}`);
  await app2.close();
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
