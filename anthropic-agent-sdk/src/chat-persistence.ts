/**
 * Chat Persistence — Solving the Simple Chat App's storage problem
 *
 * Anthropic's simple-chatapp uses an in-memory ChatStore (a Map).
 * Their README says:
 *   "Replace the in-memory ChatStore with a database.
 *    Currently all chats are lost on server restart."
 *   "For Agent Sessions to be persisted across server restarts,
 *    you'll need to persist and restore the SDK's conversation transcripts."
 *
 * This example shows DialogueChatStore as a drop-in replacement:
 *   1. Create a chat, run an agent, persist each exchange
 *   2. Simulate a server restart — new store instance, no in-memory state
 *   3. List chats (still there), load messages (all preserved)
 *   4. Continue the conversation with full context from DialogueDB
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { setGlobalConfig } from "dialogue-db";
import { DialogueChatStore } from "./lib/dialogue-store.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

type ContentBlock = { type: string; text?: string };

function extractText(content: unknown[]): string {
  return (content as ContentBlock[])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("");
}

async function agentReply(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  let text = "";
  for await (const message of query({
    prompt,
    options: {
      model: "haiku",
      maxTurns: 1,
      systemPrompt:
        systemPrompt ?? "You are a helpful support agent. Be concise (2-3 sentences max).",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === "assistant") {
      text = extractText(message.message.content);
    }
  }
  return text;
}

async function main() {
  console.log("=== Chat Persistence: DialogueDB vs In-Memory ===\n");

  // --- Step 1: Create a chat and have a conversation ---
  const store = new DialogueChatStore();
  const chat = await store.createChat("support-conversation");
  console.log(`Created chat: ${chat.id}\n`);

  const msg1 =
    "My name is Alice and I'm having trouble with my API key — " +
    "it returns 401 on every request.";
  await store.addMessage(chat.id, "user", msg1);
  console.log(`[user] ${msg1}\n`);

  const reply1 = await agentReply(msg1);
  await store.addMessage(chat.id, "assistant", reply1);
  console.log(`[assistant] ${reply1}\n`);

  const msg2 =
    "I regenerated the key but same issue. " +
    "I'm using the key from the 'test' project.";
  await store.addMessage(chat.id, "user", msg2);
  console.log(`[user] ${msg2}\n`);

  const reply2 = await agentReply(msg2,
    "You are a helpful support agent. Be concise. " +
    "Context: User Alice has API key returning 401 errors."
  );
  await store.addMessage(chat.id, "assistant", reply2);
  console.log(`[assistant] ${reply2}\n`);

  // --- Step 2: Simulate server restart ---
  console.log("--- Server restart (new store instance, no in-memory state) ---\n");

  const newStore = new DialogueChatStore();

  // List chats — they survived the restart
  const chats = await newStore.getAllChats();
  console.log(`Chats after restart: ${chats.length}`);
  for (const c of chats) {
    console.log(`  - ${c.id} (${c.label ?? "no label"})`);
  }

  // Load messages — full history preserved
  const messages = await newStore.getMessages(chat.id);
  console.log(`\nMessages in chat: ${messages.length}\n`);

  for (const m of messages) {
    const preview =
      typeof m.content === "string"
        ? m.content.slice(0, 100)
        : JSON.stringify(m.content).slice(0, 100);
    console.log(`  [${m.role}] ${preview}...`);
  }

  // --- Step 3: Continue the conversation after restart ---
  console.log("\n--- Continuing conversation after restart ---\n");

  const history = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const resumeMsg =
    "What was my name again? And what project was I asking about?";
  await newStore.addMessage(chat.id, "user", resumeMsg);
  console.log(`[user] ${resumeMsg}\n`);

  const reply3 = await agentReply(
    resumeMsg,
    "You are continuing a support conversation. Here is the full history:\n\n" +
      history +
      "\n\nAnswer based on the conversation above. Be concise."
  );
  await newStore.addMessage(chat.id, "assistant", reply3);
  console.log(`[assistant] ${reply3}\n`);

  // --- Step 4: Side-by-side comparison ---
  console.log("--- Comparison ---\n");
  console.log("Their approach (in-memory Map):");
  console.log("  Chats after restart: 0 (all lost)");
  console.log("  Messages after restart: 0 (all lost)");
  console.log("  Context continuity: impossible\n");
  console.log("DialogueChatStore (DialogueDB):");
  console.log(`  Chats after restart: ${chats.length} (preserved)`);
  console.log(`  Messages after restart: ${messages.length} (preserved)`);
  console.log("  Context continuity: full history injected into new agent\n");

  // Cleanup
  await newStore.deleteChat(chat.id);
  console.log("Cleaned up. Done!");
}

main().catch(console.error);
