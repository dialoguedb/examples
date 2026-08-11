/**
 * Demo — Exercises the Chat API and proves persistence across cold restarts
 *
 * This script:
 * 1. Starts an Express server in-process
 * 2. Creates a chat, sends messages, and gets AI responses
 * 3. Simulates a cold restart by stopping the server and starting a fresh one
 * 4. Loads the chat from DialogueDB — full history is preserved
 * 5. Continues the conversation with full context
 *
 * Run:  npm run demo
 */

import express from "express";
import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import http from "node:http";
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
// App factory — creates a fresh Express app backed by DialogueDB.
// Each call simulates a new server instance (cold start).
// ---------------------------------------------------------------------------

function createApp() {
  const db = new DialogueDB();
  const app = express();
  app.use(express.json());

  function toAnthropicMessages(dialogue: Dialogue) {
    return dialogue.messages.map((m) => {
      const role: "user" | "assistant" =
        m.role === "assistant" ? "assistant" : "user";
      return { role, content: String(m.content) };
    });
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

  app.post("/chats", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { label, systemPrompt } = req.body;
      const dialogue = await db.createDialogue({
        label,
        state: systemPrompt ? { systemPrompt } : undefined,
      });
      res.status(201).json({ id: dialogue.id, label: label ?? null });
    } catch (err) {
      next(err);
    }
  });

  app.get("/chats", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { items } = await db.listDialogues();
      res.json(items.map((d) => ({ id: d.id, label: d.label })));
    } catch (err) {
      next(err);
    }
  });

  app.get(
    "/chats/:id/messages",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dialogue = await db.getDialogue(req.params.id);
        if (!dialogue) {
          res.status(404).json({ error: "Chat not found" });
          return;
        }
        await dialogue.loadMessages({ order: "asc" });
        res.json(
          dialogue.messages.map((m) => ({ role: m.role, content: m.content }))
        );
      } catch (err) {
        next(err);
      }
    }
  );

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

        await dialogue.loadMessages({ order: "asc" });
        await dialogue.saveMessage({ role: "user", content: message });

        const rawPrompt = dialogue.state.systemPrompt;
        const systemPrompt =
          typeof rawPrompt === "string" ? rawPrompt : undefined;
        const reply = await chat(toAnthropicMessages(dialogue), systemPrompt);
        await dialogue.saveMessage({ role: "assistant", content: reply });
        res.json({ role: "assistant", content: reply });
      } catch (err) {
        next(err);
      }
    }
  );

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

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start an Express app on a random port, return the port and a close fn. */
function startServer(
  app: express.Express
): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on("error", reject);
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unexpected server address format"));
        return;
      }
      resolve({
        port: addr.port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

/** Call an API endpoint. */
async function api(
  port: number,
  method: string,
  path: string,
  body?: Record<string, string>
) {
  const headers: Record<string, string> = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB + Express: Chat API Demo ===\n");

  // --- Server instance 1 ---
  console.log("--- Server instance 1 (initial) ---\n");
  const app1 = createApp();
  const server1 = await startServer(app1);
  const port1 = server1.port;

  // Create a chat with a custom system prompt
  const created = await api(port1, "POST", "/chats", {
    label: "express-demo",
    systemPrompt:
      "You are a concise Spanish language tutor. Keep answers under 3 sentences. Use examples when helpful.",
  });
  const chatId = String(created.id);
  console.log(`Created chat: ${chatId}\n`);

  // First exchange
  const r1 = await api(port1, "POST", `/chats/${chatId}/messages`, {
    message:
      "Hi! My name is Alex. I want to learn basic Spanish greetings. How do I say hello?",
  });
  console.log(
    `[user] Hi! My name is Alex. I want to learn basic Spanish greetings.`
  );
  console.log(`[assistant] ${String(r1.content)}\n`);

  // Second exchange
  const r2 = await api(port1, "POST", `/chats/${chatId}/messages`, {
    message: 'How do I say "nice to meet you" in Spanish?',
  });
  console.log(`[user] How do I say "nice to meet you" in Spanish?`);
  console.log(`[assistant] ${String(r2.content)}\n`);

  // Stop server 1
  await server1.close();

  // --- Simulate cold restart ---
  console.log(
    "--- Server instance 2 (cold restart — new app, no in-memory state) ---\n"
  );
  const app2 = createApp();
  const server2 = await startServer(app2);
  const port2 = server2.port;

  // List chats — they survived the restart because DialogueDB persists them
  const chats = await api(port2, "GET", "/chats");
  const chatList = Array.isArray(chats) ? chats : [];
  console.log(`Chats after restart: ${chatList.length}`);
  for (const c of chatList) {
    console.log(`  - ${String(c.id)} (${String(c.label)})`);
  }

  // Load message history — all messages are preserved
  const history = await api(port2, "GET", `/chats/${chatId}/messages`);
  const messages = Array.isArray(history) ? history : [];
  console.log(`\nMessages in chat: ${messages.length}`);
  for (const m of messages) {
    const content = String(m.content);
    const preview = content.length > 80 ? content.slice(0, 80) + "..." : content;
    console.log(`  [${String(m.role)}] ${preview}`);
  }

  // Continue the conversation — Claude has full context from before the restart
  console.log("\n--- Continuing conversation after restart ---\n");
  const r3 = await api(port2, "POST", `/chats/${chatId}/messages`, {
    message:
      "Quick recap: what's my name and what were we discussing? Then teach me how to say goodbye.",
  });
  console.log(
    `[user] Quick recap: what's my name and what were we discussing?`
  );
  console.log(`[assistant] ${String(r3.content)}\n`);

  // Verify context was preserved
  const reply = String(r3.content).toLowerCase();
  const remembered =
    reply.includes("alex") &&
    (reply.includes("spanish") ||
      reply.includes("greet") ||
      reply.includes("hola"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );

  // Cleanup
  await api(port2, "DELETE", `/chats/${chatId}`);
  await server2.close();
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
