/**
 * DialogueDB + Hono — Chat API Server
 *
 * A lightweight REST API that manages AI conversations with persistent history.
 * Hono handles routing, DialogueDB stores the conversation history, and Claude
 * provides the AI responses.
 *
 * Endpoints:
 *   POST   /chats                 — Create a new chat
 *   GET    /chats                 — List all chats
 *   GET    /chats/:id/messages    — Get chat history
 *   POST   /chats/:id/messages    — Send a message and get AI response
 *   DELETE /chats/:id             — Delete a chat
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
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

const app = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert DialogueDB messages to Anthropic Messages API format. */
function toAnthropicMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

/** Send messages to Claude, return the text response. */
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

/** Create a new chat. Optionally accepts a system prompt stored in dialogue state. */
app.post("/chats", async (c) => {
  const body = await c.req.json<{ label?: string; systemPrompt?: string }>();

  // DialogueDB: create a dialogue to represent this chat.
  // The optional system prompt is stored in dialogue state so it persists
  // across server restarts — no local storage needed.
  const dialogue = await db.createDialogue({
    label: body.label,
    state: body.systemPrompt ? { systemPrompt: body.systemPrompt } : undefined,
  });

  return c.json({ id: dialogue.id, label: body.label ?? null }, 201);
});

/** List all chats. */
app.get("/chats", async (c) => {
  // DialogueDB: list all dialogues. Each has id, label, status, timestamps.
  const { items } = await db.listDialogues();
  return c.json(items.map((d) => ({ id: d.id, label: d.label })));
});

/** Get chat message history. */
app.get("/chats/:id/messages", async (c) => {
  const dialogue = await db.getDialogue(c.req.param("id"));
  if (!dialogue) return c.json({ error: "Chat not found" }, 404);

  // DialogueDB: load all persisted messages in chronological order.
  await dialogue.loadMessages({ order: "asc" });

  return c.json(
    dialogue.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))
  );
});

/** Send a user message and get an AI response. Both are persisted. */
app.post("/chats/:id/messages", async (c) => {
  const dialogue = await db.getDialogue(c.req.param("id"));
  if (!dialogue) return c.json({ error: "Chat not found" }, 404);

  const { message } = await c.req.json<{ message: string }>();
  if (!message) return c.json({ error: "message is required" }, 400);

  // DialogueDB: load existing conversation history so Claude has full context.
  await dialogue.loadMessages({ order: "asc" });

  // DialogueDB: persist the user message before calling the LLM.
  await dialogue.saveMessage({ role: "user", content: message });

  // Build the message array and call Claude.
  const systemPrompt = (dialogue.state as { systemPrompt?: string })
    ?.systemPrompt;
  const reply = await chat(toAnthropicMessages(dialogue), systemPrompt);

  // DialogueDB: persist the assistant response. Now the full exchange is
  // stored and will survive server restarts, deployments, or cold starts.
  await dialogue.saveMessage({ role: "assistant", content: reply });

  return c.json({ role: "assistant", content: reply });
});

/** Delete a chat and all its messages. */
app.delete("/chats/:id", async (c) => {
  await db.deleteDialogue(c.req.param("id"));
  return c.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT ?? "3000");
console.log(`Chat API server running on http://localhost:${port}`);
console.log(`
Endpoints:
  POST   /chats                 — Create a new chat
  GET    /chats                 — List all chats
  GET    /chats/:id/messages    — Get chat history
  POST   /chats/:id/messages    — Send a message, get AI response
  DELETE /chats/:id             — Delete a chat
`);
serve({ fetch: app.fetch, port });
