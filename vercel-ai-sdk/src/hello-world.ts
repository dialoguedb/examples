/**
 * Hello World — DialogueDB + Vercel AI SDK
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Claude via `generateText`, saving every message
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — Claude has full context from before the restart
 */

import { generateText, type CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";

import { initDialogueDB, toCoreMessages } from "./lib/utils.js";

initDialogueDB();

const db = new DialogueDB();
const model = anthropic("claude-sonnet-4-20250514");

/** Send messages via generateText and return the response text. */
async function chat(messages: CoreMessage[]): Promise<string> {
  const { text } = await generateText({
    model,
    messages,
  });
  return text;
}

async function main() {
  console.log("=== DialogueDB + Vercel AI SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "vercel-ai-hello-world" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Marcus and I'm building a recipe recommendation app. What tech stack would you suggest?",
  });
  const reply1 = await chat(toCoreMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 — Claude: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "I also want dietary restriction filtering and meal planning features. How should I model the data?",
  });
  const reply2 = await chat(toCoreMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 — Claude: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation — Claude should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what features did we discuss?",
  });
  const reply3 = await chat(toCoreMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) — Claude:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("marcus") &&
    (lower.includes("recipe") || lower.includes("meal") || lower.includes("dietary"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
