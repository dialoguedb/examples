/**
 * DialogueDB + WebSocket — Real-Time Chat Server
 *
 * A WebSocket chat server where every conversation persists in DialogueDB.
 * Clients can disconnect and reconnect with their dialogue ID to resume
 * with full history — even after a server restart.
 *
 * Start:  npm run server
 * Client: npm run client
 */

import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "node:http";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";
const SYSTEM_PROMPT =
  "You are a helpful assistant in a real-time chat. Be concise and conversational.";

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

interface OutboundMessage {
  type: "connected" | "response" | "error" | "deleted";
  dialogueId?: string;
  text?: string;
  history?: Array<{ role: string; content: string }>;
}

function send(ws: WebSocket, msg: OutboundMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function parseInbound(
  raw: string
): { type: string; text?: string } | null {
  try {
    const data = JSON.parse(raw);
    if (data && typeof data.type === "string") {
      return {
        type: data.type,
        text: typeof data.text === "string" ? data.text : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contentToString(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const m of dialogue.messages) {
    const content = contentToString(m.content);
    if (m.role === "user") {
      result.push({ role: "user", content });
    } else if (m.role === "assistant") {
      result.push({ role: "assistant", content });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

async function handleConnection(ws: WebSocket, request: IncomingMessage) {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`
  );
  const existingId = url.searchParams.get("dialogueId");

  let dialogue: Dialogue;

  if (existingId) {
    // Resume an existing conversation from DialogueDB
    const loaded = await db.getDialogue(existingId);
    if (!loaded) {
      send(ws, { type: "error", text: `Dialogue ${existingId} not found` });
      ws.close();
      return;
    }
    dialogue = loaded;
    await dialogue.loadMessages({ order: "asc" });

    send(ws, {
      type: "connected",
      dialogueId: dialogue.id,
      history: dialogue.messages.map((m) => ({
        role: m.role,
        content: contentToString(m.content),
      })),
    });
    console.log(
      `Resumed dialogue ${dialogue.id} (${dialogue.messages.length} messages)`
    );
  } else {
    // Start a new conversation backed by DialogueDB
    dialogue = await db.createDialogue({
      label: "ws-chat",
      state: { provider: "openai", model: MODEL, transport: "websocket" },
    });
    send(ws, { type: "connected", dialogueId: dialogue.id });
    console.log(`New dialogue: ${dialogue.id}`);
  }

  ws.on("message", async (raw) => {
    try {
      const parsed = parseInbound(String(raw));
      if (!parsed) {
        send(ws, { type: "error", text: "Invalid JSON" });
        return;
      }

      if (parsed.type === "delete") {
        await db.deleteDialogue(dialogue.id);
        send(ws, { type: "deleted" });
        console.log(`Deleted dialogue ${dialogue.id}`);
        ws.close();
        return;
      }

      if (parsed.type !== "message" || !parsed.text) {
        send(ws, {
          type: "error",
          text: 'Send { "type": "message", "text": "..." }',
        });
        return;
      }

      // Persist the user message in DialogueDB
      await dialogue.saveMessage({ role: "user", content: parsed.text });

      // Send full conversation history to OpenAI
      const response = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: 1024,
        messages: toOpenAIMessages(dialogue),
      });

      const reply = response.choices[0].message.content ?? "";

      // Persist the assistant response in DialogueDB
      await dialogue.saveMessage({ role: "assistant", content: reply });

      send(ws, { type: "response", text: reply });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Error:", message);
      send(ws, { type: "error", text: message });
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected (dialogue: ${dialogue.id})`);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT ?? "8080");
const wss = new WebSocketServer({ port });

wss.on("connection", (ws, request) => {
  handleConnection(ws, request).catch((err) => {
    console.error("Connection error:", err);
    send(ws, { type: "error", text: "Internal server error" });
    ws.close();
  });
});

console.log(`WebSocket chat server running on ws://localhost:${port}`);
console.log(
  `To resume a conversation: ws://localhost:${port}?dialogueId=<id>`
);
