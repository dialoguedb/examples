/**
 * DialogueDB + Fastify — Chat API Server
 *
 * A REST API that manages AI conversations with persistent history.
 * Fastify handles routing and request validation, DialogueDB stores the
 * conversation history, and Claude provides the AI responses.
 *
 * Endpoints:
 *   POST   /chats                 — Create a new chat
 *   GET    /chats                 — List all chats
 *   GET    /chats/:id/messages    — Get chat history
 *   POST   /chats/:id/messages    — Send a message and get AI response
 *   DELETE /chats/:id             — Delete a chat
 */

import Fastify from "fastify";
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

const app = Fastify({ logger: true });

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
app.post<{
  Body: { label?: string; systemPrompt?: string };
}>("/chats", {
  schema: {
    body: {
      type: "object",
      properties: {
        label: { type: "string" },
        systemPrompt: { type: "string" },
      },
    },
  },
  handler: async (request, reply) => {
    const { label, systemPrompt } = request.body;

    // DialogueDB: create a dialogue to represent this chat.
    // The optional system prompt is stored in dialogue state so it persists
    // across server restarts — no local storage needed.
    const dialogue = await db.createDialogue({
      label,
      state: systemPrompt ? { systemPrompt } : undefined,
    });

    return reply.code(201).send({ id: dialogue.id, label: label ?? null });
  },
});

/** List all chats. */
app.get("/chats", async () => {
  // DialogueDB: list all dialogues. Each has id, label, status, timestamps.
  const { items } = await db.listDialogues();
  return items.map((d) => ({ id: d.id, label: d.label }));
});

/** Get chat message history. */
app.get<{
  Params: { id: string };
}>("/chats/:id/messages", async (request, reply) => {
  const dialogue = await db.getDialogue(request.params.id);
  if (!dialogue) return reply.code(404).send({ error: "Chat not found" });

  // DialogueDB: load all persisted messages in chronological order.
  await dialogue.loadMessages({ order: "asc" });

  return dialogue.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
});

/** Send a user message and get an AI response. Both are persisted. */
app.post<{
  Params: { id: string };
  Body: { message: string };
}>("/chats/:id/messages", {
  schema: {
    body: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
      },
    },
  },
  handler: async (request, reply) => {
    const dialogue = await db.getDialogue(request.params.id);
    if (!dialogue) return reply.code(404).send({ error: "Chat not found" });

    const { message } = request.body;

    // DialogueDB: load existing conversation history so Claude has full context.
    await dialogue.loadMessages({ order: "asc" });

    // DialogueDB: persist the user message before calling the LLM.
    await dialogue.saveMessage({ role: "user", content: message });

    // Build the message array and call Claude.
    const systemPrompt = (dialogue.state as { systemPrompt?: string })
      ?.systemPrompt;
    const replyText = await chat(toAnthropicMessages(dialogue), systemPrompt);

    // DialogueDB: persist the assistant response. Now the full exchange is
    // stored and will survive server restarts, deployments, or cold starts.
    await dialogue.saveMessage({ role: "assistant", content: replyText });

    return { role: "assistant", content: replyText };
  },
});

/** Delete a chat and all its messages. */
app.delete<{
  Params: { id: string };
}>("/chats/:id", async (request) => {
  await db.deleteDialogue(request.params.id);
  return { deleted: true };
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT ?? "3000");

app.listen({ port }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`
Endpoints:
  POST   /chats                 — Create a new chat
  GET    /chats                 — List all chats
  GET    /chats/:id/messages    — Get chat history
  POST   /chats/:id/messages    — Send a message, get AI response
  DELETE /chats/:id             — Delete a chat
`);
});
