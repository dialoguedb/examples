/**
 * DialogueDB + Koa — Chat API Server
 *
 * A REST API that manages AI conversations with persistent history.
 * Koa handles routing and middleware, DialogueDB stores the conversation
 * history, and Claude provides the AI responses.
 *
 * Endpoints:
 *   POST   /chats                 — Create a new chat
 *   GET    /chats                 — List all chats
 *   GET    /chats/:id/messages    — Get chat history
 *   POST   /chats/:id/messages    — Send a message and get AI response
 *   DELETE /chats/:id             — Delete a chat
 */

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
const db = new DialogueDB();
const MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const router = new Router();

router.post("/chats", async (ctx) => {
  const { label, systemPrompt } = ctx.request.body as {
    label?: string;
    systemPrompt?: string;
  };

  // DialogueDB: create a dialogue to represent this chat.
  // The optional system prompt is stored in dialogue state so it persists
  // across server restarts — no local storage needed.
  const dialogue = await db.createDialogue({
    label,
    state: systemPrompt ? { systemPrompt } : undefined,
  });

  ctx.status = 201;
  ctx.body = { id: dialogue.id, label: label ?? null };
});

router.get("/chats", async (ctx) => {
  // DialogueDB: list all dialogues. Each has id, label, status, timestamps.
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

  // DialogueDB: load all persisted messages in chronological order.
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

  // DialogueDB: load existing conversation history so Claude has full context.
  await dialogue.loadMessages({ order: "asc" });

  // DialogueDB: persist the user message before calling the LLM.
  await dialogue.saveMessage({ role: "user", content: message });

  // Build the message array and call Claude.
  const state = dialogue.state as { systemPrompt?: string } | null;
  const reply = await chat(toAnthropicMessages(dialogue), state?.systemPrompt);

  // DialogueDB: persist the assistant response. Now the full exchange is
  // stored and will survive server restarts, deployments, or cold starts.
  await dialogue.saveMessage({ role: "assistant", content: reply });

  ctx.body = { role: "assistant", content: reply };
});

router.delete("/chats/:id", async (ctx) => {
  await db.deleteDialogue(ctx.params.id);
  ctx.body = { deleted: true };
});

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Koa();
app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(process.env.PORT ?? "3000");

app.listen(port, () => {
  console.log(`Chat API server running on http://localhost:${port}`);
  console.log(`
Endpoints:
  POST   /chats                 — Create a new chat
  GET    /chats                 — List all chats
  GET    /chats/:id/messages    — Get chat history
  POST   /chats/:id/messages    — Send a message, get AI response
  DELETE /chats/:id             — Delete a chat
`);
});
