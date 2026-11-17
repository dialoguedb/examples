/**
 * Demo — DialogueDB + Socket.IO persistence across reconnections
 *
 * 1. Starts the chat server in-process
 * 2. Connects a client and chats (GPT responds, messages stored in DialogueDB)
 * 3. Disconnects (simulating a browser refresh or network drop)
 * 4. Reconnects — full chat history is loaded from DialogueDB
 * 5. Continues the conversation — GPT has full context from before
 */

import { io as ioc, type Socket } from "socket.io-client";
import "dotenv/config";

import { startServer } from "./server.js";
import { NAMESPACE, type ChatMessage } from "./persist.js";

// ---------------------------------------------------------------------------
// Socket helpers — typed wrappers around Socket.IO events
// ---------------------------------------------------------------------------

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (err: Error) => reject(err));
  });
}

function join(socket: Socket, dialogueId: string): Promise<ChatMessage[]> {
  return new Promise<ChatMessage[]>((resolve, reject) => {
    socket.once("history", (messages: ChatMessage[]) => resolve(messages));
    socket.once("error", (msg: string) => reject(new Error(msg)));
    socket.emit("join", { dialogueId }, (ok: boolean) => {
      if (!ok) reject(new Error("Join rejected"));
    });
  });
}

function sendMessage(socket: Socket, text: string): Promise<ChatMessage> {
  return new Promise<ChatMessage>((resolve, reject) => {
    socket.once("reply", (msg: ChatMessage) => resolve(msg));
    socket.once("error", (msg: string) => reject(new Error(msg)));
    socket.emit("message", { text });
  });
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== DialogueDB + Socket.IO: Real-Time Chat Demo ===\n");

  // Start the server on a random available port
  const { httpServer, io, db } = await startServer(0);
  const address = httpServer.address();
  if (!address || typeof address === "string")
    throw new Error("Failed to bind server");
  const url = `http://localhost:${address.port}`;

  const dialogueId = `socket-demo-${Date.now()}`;

  try {
    // --- Session 1: Connect and chat ---
    console.log("--- Session 1: Initial connection ---\n");

    const client1 = ioc(url);
    await waitForConnect(client1);

    const history1 = await join(client1, dialogueId);
    console.log(
      `Joined ${dialogueId} — ${history1.length} messages in history\n`,
    );

    const reply1 = await sendMessage(
      client1,
      "My name is Alice and I'm building a real-time dashboard for IoT sensors. What architecture would you recommend?",
    );
    console.log(
      "[user]      My name is Alice and I'm building a real-time dashboard...",
    );
    console.log(`[assistant] ${reply1.text.slice(0, 150)}...\n`);

    const reply2 = await sendMessage(
      client1,
      "Good points. I also need to handle sensor alerts that trigger notifications. How would you add that?",
    );
    console.log("[user]      I also need to handle sensor alerts...");
    console.log(`[assistant] ${reply2.text.slice(0, 150)}...\n`);

    // Disconnect (like closing a browser tab)
    client1.disconnect();
    console.log(
      "--- Client disconnected (simulating browser refresh) ---\n",
    );

    // --- Session 2: Reconnect and resume ---
    console.log("--- Session 2: Reconnection ---\n");

    const client2 = ioc(url);
    await waitForConnect(client2);

    // DialogueDB loads the full conversation history on rejoin
    const history2 = await join(client2, dialogueId);
    console.log(
      `Reconnected to ${dialogueId} — ${history2.length} messages restored\n`,
    );

    for (const msg of history2) {
      const preview =
        msg.text.length > 80 ? msg.text.slice(0, 80) + "..." : msg.text;
      console.log(`  [${msg.role}] ${preview}`);
    }

    // Continue — GPT should remember everything from before the disconnect
    console.log("");
    const reply3 = await sendMessage(
      client2,
      "Quick recap: what's my name and what were the two features we discussed?",
    );
    console.log(
      "[user]      Quick recap: what's my name and what were the two features?",
    );
    console.log(`[assistant] ${reply3.text}\n`);

    // Verify context was preserved
    const lower = reply3.text.toLowerCase();
    const remembered =
      lower.includes("alice") &&
      (lower.includes("dashboard") ||
        lower.includes("sensor") ||
        lower.includes("alert"));
    console.log(
      `Context preserved across reconnection: ${remembered ? "YES" : "NO"}`,
    );

    client2.disconnect();
  } finally {
    await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
    io.close();
    console.log("\nCleaned up. Done!");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
