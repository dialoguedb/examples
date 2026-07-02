/**
 * Vercel AI SDK + DialogueDB — Persistent Chat
 *
 * 1. Start a conversation using the AI SDK's generateText
 * 2. Every message is automatically persisted to DialogueDB
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — the AI has full context from before
 *
 * Swap openai() for anthropic() or google() and the persistence code stays identical.
 */

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import type { ModelMessage } from "ai";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const model = openai("gpt-4o-mini");

const SYSTEM_PROMPT =
  "You are a helpful coding assistant. Be concise but thorough.";

/** Convert DialogueDB messages to the AI SDK's ModelMessage format. */
function toMessages(dialogue: Dialogue): ModelMessage[] {
  return dialogue.messages.map((m): ModelMessage => {
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "user") return { role: "user", content };
    if (m.role === "assistant") return { role: "assistant", content };
    throw new Error(`Unexpected role: ${m.role}`);
  });
}

/** Send a message, get a response, persist both to DialogueDB. */
async function chat(dialogue: Dialogue, userMessage: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: toMessages(dialogue),
  });

  await dialogue.saveMessage({ role: "assistant", content: text });
  return text;
}

// ---------------------------------------------------------------------------
// Invocation 1 — Start a conversation
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: New Conversation ===\n");

  const dialogue = await db.createDialogue({
    label: "vercel-ai-sdk-demo",
    state: { provider: "openai", model: "gpt-4o-mini" },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  const reply1 = await chat(
    dialogue,
    "Hi! I'm building a task management CLI in Rust. " +
      "What crate should I use for argument parsing?"
  );
  console.log(`Assistant: ${reply1.slice(0, 200)}...\n`);

  const reply2 = await chat(
    dialogue,
    "Good choice. How would I structure subcommands for add, list, and complete?"
  );
  console.log(`Assistant: ${reply2.slice(0, 200)}...\n`);

  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(`Dialogue ID: ${dialogue.id}\n`);

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 — Cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string): Promise<void> {
  console.log("=== Invocation 2: Cold Resume ===\n");

  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages from DialogueDB\n`);

  const reply = await chat(
    dialogue,
    "Quick recap: what project am I building, what language, " +
      "and what did you recommend so far?"
  );
  console.log(`Assistant (after restart):\n${reply}\n`);

  const lower = reply.toLowerCase();
  const contextPreserved =
    lower.includes("rust") &&
    (lower.includes("cli") || lower.includes("task") || lower.includes("clap"));
  console.log(`Context preserved: ${contextPreserved ? "YES" : "NO"}`);
  console.log(`Total messages: ${dialogue.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogueId);
  console.log("\nCleaned up. Done!");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--invocation="));
  const invocation = flag ? parseInt(flag.split("=")[1]) : 0;

  if (invocation === 1) {
    const id = await invocation1();
    console.log(
      `\nTo resume:\n  DIALOGUE_ID=${id} npm run start:2`
    );
  } else if (invocation === 2) {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId) {
      throw new Error("DIALOGUE_ID env var required for invocation 2");
    }
    await invocation2(dialogueId);
  } else {
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
