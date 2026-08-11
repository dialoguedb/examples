/**
 * WebSocket Chat Client
 *
 * Interactive CLI client for the WebSocket chat server.
 * Pass a dialogue ID as the first argument to resume a previous conversation.
 *
 * Usage:
 *   npm run client                    — start a new conversation
 *   npm run client -- <dialogueId>    — resume a conversation
 *
 * Commands:
 *   /quit    — disconnect (conversation persists in DialogueDB)
 *   /delete  — delete conversation and disconnect
 */

import WebSocket from "ws";
import * as readline from "node:readline";

const port = process.env.PORT ?? "8080";
const dialogueId = process.argv[2];

const url = dialogueId
  ? `ws://localhost:${port}?dialogueId=${dialogueId}`
  : `ws://localhost:${port}`;

console.log(`Connecting to ${url}...\n`);

const ws = new WebSocket(url);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt() {
  rl.question("You: ", (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    if (trimmed === "/quit") {
      console.log("Disconnecting (conversation saved in DialogueDB).");
      ws.close();
      return;
    }

    if (trimmed === "/delete") {
      ws.send(JSON.stringify({ type: "delete" }));
      return;
    }

    ws.send(JSON.stringify({ type: "message", text: trimmed }));
  });
}

interface ServerMessage {
  type: string;
  dialogueId?: string;
  text?: string;
  history?: Array<{ role: string; content: string }>;
}

ws.on("message", (raw) => {
  let msg: ServerMessage;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    console.error("Invalid server message");
    return;
  }

  switch (msg.type) {
    case "connected":
      console.log(`Dialogue: ${msg.dialogueId}`);
      console.log('Type a message to chat, "/quit" to disconnect, "/delete" to remove.\n');
      if (msg.history && msg.history.length > 0) {
        console.log(`--- History (${msg.history.length} messages) ---`);
        for (const m of msg.history) {
          const label = m.role === "user" ? "You" : "AI";
          console.log(`${label}: ${m.content}`);
        }
        console.log("--- End of history ---\n");
      }
      prompt();
      break;

    case "response":
      console.log(`AI: ${msg.text}\n`);
      prompt();
      break;

    case "deleted":
      console.log("Conversation deleted.");
      ws.close();
      break;

    case "error":
      console.error(`Error: ${msg.text}\n`);
      prompt();
      break;
  }
});

ws.on("close", () => {
  rl.close();
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("Connection error:", err.message);
  process.exit(1);
});
