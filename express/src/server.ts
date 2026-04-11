/**
 * DialogueDB + Express — Chat API Server
 *
 * A REST API for AI-powered conversations with persistent history.
 * Express handles routing and middleware, DialogueDB stores the
 * conversation history, and Claude provides the AI responses.
 *
 * Endpoints:
 *   POST   /chats                 — Create a new chat
 *   GET    /chats                 — List all chats
 *   GET    /chats/:id/messages    — Get chat history
 *   POST   /chats/:id/messages    — Send a message and get AI response
 *   DELETE /chats/:id             — Delete a chat
 */

import express from "express";
import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
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

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert DialogueDB messages to Anthropic Messages API format. */
function toAnthropicMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) => {
    const role: "user" | "assistant" =
      m.role === "assistant" ? "assistant" : "user";
    return { role, content: String(m.content) };
  });
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
app.post("/chats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { label, systemPrompt } = req.body;

    // DialogueDB: create a dialogue to represent this chat.
    // The optional system prompt is stored in dialogue state so it persists
    // across server restarts — no local storage needed.
    const dialogue = await db.createDialogue({
      label,
      state: systemPrompt ? { systemPrompt } : undefined,
    });

    res.status(201).json({ id: dialogue.id, label: label ?? null });
  } catch (err) {
    next(err);
  }
});

/** List all chats. */
app.get("/chats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // DialogueDB: list all dialogues. Each has id, label, status, timestamps.
    const { items } = await db.listDialogues();
    res.json(items.map((d) => ({ id: d.id, label: d.label })));
  } catch (err) {
    next(err);
  }
});

/** Get chat message history. */
app.get(
  "/chats/:id/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dialogue = await db.getDialogue(req.params.id);
      if (!dialogue) {
        res.status(404).json({ error: "Chat not found" });
        return;
      }

      // DialogueDB: load all persisted messages in chronological order.
      await dialogue.loadMessages({ order: "asc" });

      res.json(
        dialogue.messages.map((m) => ({ role: m.role, content: m.content }))
      );
    } catch (err) {
      next(err);
    }
  }
);

/** Send a user message and get an AI response. Both are persisted. */
app.post(
  "/chats/:id/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dialogue = await db.getDialogue(req.params.id);
      if (!dialogue) {
        res.status(404).json({ error: "Chat not found" });
        return;
      }

      const { message } = req.body;
      if (!message) {
        res.status(400).json({ error: "message is required" });
        return;
      }

      // DialogueDB: load existing conversation history so Claude has full context.
      await dialogue.loadMessages({ order: "asc" });

      // DialogueDB: persist the user message before calling the LLM.
      await dialogue.saveMessage({ role: "user", content: message });

      // Retrieve system prompt from dialogue state and call Claude.
      const rawPrompt = dialogue.state.systemPrompt;
      const systemPrompt =
        typeof rawPrompt === "string" ? rawPrompt : undefined;
      const reply = await chat(toAnthropicMessages(dialogue), systemPrompt);

      // DialogueDB: persist the assistant response. Now the full exchange is
      // stored and will survive server restarts, deployments, or cold starts.
      await dialogue.saveMessage({ role: "assistant", content: reply });

      res.json({ role: "assistant", content: reply });
    } catch (err) {
      next(err);
    }
  }
);

/** Delete a chat and all its messages. */
app.delete(
  "/chats/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await db.deleteDialogue(req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

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
