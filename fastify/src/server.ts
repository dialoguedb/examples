/**
 * DialogueDB + Fastify — Chat API Server
 *
 * A type-safe REST API that manages AI conversations with persistent history.
 * Fastify handles routing with JSON Schema validation, DialogueDB stores the
 * conversation history, and OpenAI provides the AI responses.
 *
 * Endpoints:
 *   POST   /chats                 — Create a new chat
 *   GET    /chats                 — List all chats
 *   GET    /chats/:id/messages    — Get chat history
 *   POST   /chats/:id/messages    — Send a message and get AI response
 *   DELETE /chats/:id             — Delete a chat
 */

import Fastify from "fastify";
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
const db = new DialogueDB();
const MODEL = "gpt-4o";

const app = Fastify({ logger: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert DialogueDB messages to OpenAI chat format. */
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

/** Extract the system prompt from dialogue state, if present. */
function getSystemPrompt(state: unknown): string | undefined {
  if (state && typeof state === "object" && "systemPrompt" in state) {
    return typeof state.systemPrompt === "string"
      ? state.systemPrompt
      : undefined;
  }
  return undefined;
}

/** Send messages to OpenAI and return the text response. */
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

// ---------------------------------------------------------------------------
// Routes — Fastify validates request bodies via JSON Schema at the framework
// level, so invalid requests never reach the handler.
// ---------------------------------------------------------------------------

/** Create a new chat. Optionally accepts a system prompt stored in dialogue state. */
app.post<{
  Body: { label?: string; systemPrompt?: string };
}>(
  "/chats",
  {
    schema: {
      body: {
        type: "object",
        properties: {
          label: { type: "string" },
          systemPrompt: { type: "string" },
        },
      },
      response: {
        201: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string", nullable: true },
          },
        },
      },
    },
  },
  async (request, reply) => {
    const { label, systemPrompt } = request.body;

    // DialogueDB: create a dialogue to represent this chat.
    // The optional system prompt is stored in dialogue state so it persists
    // across server restarts — no local storage needed.
    const dialogue = await db.createDialogue({
      label,
      state: systemPrompt ? { systemPrompt } : undefined,
    });

    reply.code(201);
    return { id: dialogue.id, label: label ?? null };
  }
);

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
  if (!dialogue) {
    reply.code(404);
    return { error: "Chat not found" };
  }

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
}>(
  "/chats/:id/messages",
  {
    schema: {
      body: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string" },
        },
      },
    },
  },
  async (request, reply) => {
    const dialogue = await db.getDialogue(request.params.id);
    if (!dialogue) {
      reply.code(404);
      return { error: "Chat not found" };
    }

    const { message } = request.body;

    // DialogueDB: load existing conversation history so the LLM has full context.
    await dialogue.loadMessages({ order: "asc" });

    // DialogueDB: persist the user message before calling the LLM.
    await dialogue.saveMessage({ role: "user", content: message });

    // Build the message array and call OpenAI.
    const systemPrompt = getSystemPrompt(dialogue.state);
    const reply_text = await chat(toChatMessages(dialogue), systemPrompt);

    // DialogueDB: persist the assistant response. Now the full exchange is
    // stored and will survive server restarts, deployments, or cold starts.
    await dialogue.saveMessage({ role: "assistant", content: reply_text });

    return { role: "assistant", content: reply_text };
  }
);

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
