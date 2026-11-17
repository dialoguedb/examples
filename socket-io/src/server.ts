/**
 * DialogueDB + Socket.IO — Real-Time Chat Server
 *
 * A WebSocket chat server where every message is persisted in DialogueDB.
 * Clients that reconnect (browser refresh, network drop, new device) get
 * their full conversation history back instantly.
 *
 * Client → Server events:
 *   join    { dialogueId }   — Join/resume a conversation
 *   message { text }         — Send a user message, triggers AI reply
 *
 * Server → Client events:
 *   history   [{ role, text }]  — Full chat history on join
 *   reply     { role, text }    — New AI response
 *   error     string            — Something went wrong
 */

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import OpenAI from "openai";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";

import {
  toChatMessages,
  loadDialogue,
  chat,
  requireEnv,
  type ChatMessage,
  type ServerToClientEvents,
  type ClientToServerEvents,
  type SocketData,
} from "./persist.js";

export async function startServer(port: number) {
  const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const openai = new OpenAI();

  const httpServer = createServer();
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    socket.data.dialogueId = null;

    // Load conversation history from DialogueDB and send it to the client
    socket.on("join", async (data, ack) => {
      try {
        const dialogue = await loadDialogue(db, data.dialogueId);
        socket.data.dialogueId = dialogue.id;

        const history: ChatMessage[] = dialogue.messages.map((m) => ({
          role: m.role,
          text: String(m.content),
        }));
        socket.emit("history", history);
        ack(true);
        console.log(
          `[join] ${socket.id} → ${dialogue.id} (${history.length} messages)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to join";
        socket.emit("error", msg);
        ack(false);
      }
    });

    // Persist user message, call OpenAI with full history, persist the reply
    socket.on("message", async (data) => {
      const dialogueId = socket.data.dialogueId;
      if (!dialogueId) {
        socket.emit("error", "Join a conversation first");
        return;
      }

      try {
        const dialogue = await loadDialogue(db, dialogueId);
        await dialogue.saveMessage({ role: "user", content: data.text });

        const reply = await chat(openai, toChatMessages(dialogue));
        await dialogue.saveMessage({ role: "assistant", content: reply });

        socket.emit("reply", { role: "assistant", text: reply });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to process message";
        socket.emit("error", msg);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[disconnect] ${socket.id}`);
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => resolve());
  });

  const address = httpServer.address();
  if (address && typeof address !== "string") {
    console.log(
      `Socket.IO chat server running on http://localhost:${address.port}`,
    );
    console.log("Waiting for connections...\n");
  }

  return { httpServer, io, db };
}

// Auto-start when run directly (not when imported by demo.ts)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parseInt(process.env.PORT ?? "3000");
  startServer(port).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
