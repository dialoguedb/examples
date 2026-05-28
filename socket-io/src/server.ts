/**
 * Real-time AI Chat Server — Socket.io + DialogueDB
 *
 * A WebSocket chat server where every conversation is persisted to DialogueDB.
 * Clients reconnecting to an existing dialogue get full history replayed,
 * and the AI picks up right where it left off.
 *
 * Events (client → server):
 *   "join"    { dialogueId?: string }  — Join or create a conversation
 *   "message" { content: string }      — Send a message
 *
 * Events (server → client):
 *   "history"     { dialogueId, messages }  — Full history on join
 *   "reply"       { role, content }         — AI response
 *   "chat_error"  { message }               — Error details
 */

import { Server } from "socket.io";
import { createServer } from "node:http";
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
const MODEL = "gpt-4o-mini";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  return dialogue.messages.map(
    (m): OpenAI.ChatCompletionMessageParam =>
      m.role === "assistant"
        ? { role: "assistant", content: String(m.content) }
        : { role: "user", content: String(m.content) }
  );
}

async function chat(
  messages: OpenAI.ChatCompletionMessageParam[]
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages,
  });
  return response.choices[0].message.content ?? "";
}

// ---------------------------------------------------------------------------
// Socket.io server
// ---------------------------------------------------------------------------

const httpServer = createServer();
const io = new Server(httpServer);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  let dialogue: Dialogue | null = null;

  // Join an existing dialogue or create a new one.
  // DialogueDB persists everything, so reconnecting clients get full context.
  socket.on("join", async (data?: { dialogueId?: string }) => {
    try {
      if (data?.dialogueId) {
        const loaded = await db.getDialogue(data.dialogueId);
        if (!loaded) {
          socket.emit("chat_error", { message: "Dialogue not found" });
          return;
        }
        await loaded.loadMessages({ order: "asc" });
        dialogue = loaded;

        const history = dialogue.messages.map((m) => ({
          role: m.role,
          content: String(m.content),
        }));
        socket.emit("history", { dialogueId: dialogue.id, messages: history });
        console.log(
          `Resumed dialogue ${dialogue.id} (${history.length} messages)`
        );
      } else {
        dialogue = await db.createDialogue({
          label: "socket-io-chat",
          state: { provider: "openai", format: "openai-chat", model: MODEL },
        });
        socket.emit("history", { dialogueId: dialogue.id, messages: [] });
        console.log(`Created dialogue ${dialogue.id}`);
      }
    } catch (err) {
      console.error("Join error:", err);
      socket.emit("chat_error", { message: "Failed to join dialogue" });
    }
  });

  // Handle a chat message: persist it, get an AI response, persist that too.
  socket.on("message", async (data: { content: string }) => {
    if (!dialogue) {
      socket.emit("chat_error", { message: "Join a dialogue first" });
      return;
    }

    try {
      // DialogueDB: persist the user message before calling the LLM
      await dialogue.saveMessage({ role: "user", content: data.content });

      // Get AI response with full conversation context from DialogueDB
      const reply = await chat(toOpenAIMessages(dialogue));

      // DialogueDB: persist the AI response — survives server restarts
      await dialogue.saveMessage({
        role: "assistant",
        content: reply,
        metadata: { model: MODEL },
      });

      socket.emit("reply", { role: "assistant", content: reply });
    } catch (err) {
      console.error("Message error:", err);
      socket.emit("chat_error", { message: "Failed to process message" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT ?? "3000");
httpServer.listen(port, () => {
  console.log(`Socket.io chat server running on http://localhost:${port}`);
  console.log("Waiting for clients...\n");
});
