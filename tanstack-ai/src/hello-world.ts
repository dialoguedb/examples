/**
 * Hello World - DialogueDB + TanStack AI
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with GPT via TanStack AI, saving every message
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — the model has full context from before the restart
 *
 * TanStack AI provides a provider-agnostic chat layer: swap the adapter
 * (openaiText → anthropicText → geminiText) and the rest of your code stays
 * the same. DialogueDB persists the conversation so it survives restarts.
 */

import { chat, streamToText } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

requireEnv("OPENAI_API_KEY");
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
const MODEL = "gpt-4o-mini";

/** Send messages through TanStack AI and return the text response. */
async function ask(
  threadId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const stream = chat({
    adapter: openaiText(MODEL),
    messages,
    threadId,
  });
  const { text } = await streamToText(stream);
  return text;
}

/** Convert DialogueDB messages to TanStack AI's ModelMessage format. */
function toModelMessages(
  dialogue: Dialogue
): Array<{ role: "user" | "assistant"; content: string }> {
  return dialogue.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content:
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));
}

async function main() {
  console.log("=== DialogueDB + TanStack AI: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "tanstack-ai-demo" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Priya and I'm building an AI-powered code review tool. What features should I prioritize?",
  });
  const reply1 = await ask(dialogue.id, toModelMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Good thinking. I also want it to learn from team-specific patterns over time. How would you approach that?",
  });
  const reply2 = await ask(dialogue.id, toModelMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue — the model should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  });
  const reply3 = await ask(resumed.id, toModelMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart):\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("code review") || lower.includes("review tool"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
