/**
 * CLI Chat Client — connects to the Socket.io chat server.
 *
 * Usage:
 *   npx tsx src/client.ts                  — Start a new conversation
 *   npx tsx src/client.ts <dialogue-id>    — Resume an existing conversation
 */

import { io } from "socket.io-client";
import { createInterface } from "node:readline";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const dialogueId = process.argv[2];

const socket = io(SERVER_URL);
const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  rl.question("You: ", (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      prompt();
      return;
    }
    if (trimmed === "/quit") {
      console.log("Goodbye!");
      socket.disconnect();
      rl.close();
      return;
    }
    socket.emit("message", { content: trimmed });
  });
}

socket.on("connect", () => {
  console.log("Connected to chat server.\n");
  socket.emit("join", dialogueId ? { dialogueId } : undefined);
});

socket.on(
  "history",
  (data: {
    dialogueId: string;
    messages: Array<{ role: string; content: string }>;
  }) => {
    if (data.messages.length > 0) {
      console.log(
        `--- Resuming conversation (${data.messages.length} messages) ---\n`
      );
      for (const msg of data.messages) {
        const label = msg.role === "user" ? "You" : "AI";
        console.log(`${label}: ${msg.content}\n`);
      }
      console.log("--- End of history ---\n");
    } else {
      console.log("Starting new conversation.\n");
    }
    console.log(`Dialogue ID: ${data.dialogueId}`);
    console.log('Type "/quit" to exit.\n');
    prompt();
  }
);

socket.on("reply", (data: { role: string; content: string }) => {
  console.log(`\nAI: ${data.content}\n`);
  prompt();
});

socket.on("chat_error", (data: { message: string }) => {
  console.error(`Server error: ${data.message}`);
  prompt();
});

socket.on("connect_error", (err: Error) => {
  console.error(`Could not connect: ${err.message}`);
  console.error("Make sure the server is running (npm run server).");
  process.exit(1);
});

rl.on("close", () => {
  socket.disconnect();
  process.exit(0);
});
