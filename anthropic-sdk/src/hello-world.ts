/**
 * Hello World - DialogueDB + Claude API (Messages API)
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Claude, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Claude has full context from before the restart
 *
 * No tools, no state management. Just: save -> load -> Claude remembers.
 */

import Anthropic from "@anthropic-ai/sdk";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { toMessageParams, toSystemPrompt } from "./persist.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const anthropic = new Anthropic();
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
const MODEL = "claude-sonnet-4-6";

/** Send a message array to Claude, return the text response. */
async function chat(
  messages: Anthropic.MessageParam[],
  system?: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    ...(system ? { system } : {}),
    messages,
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function main() {
  console.log("=== DialogueDB + Claude API: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "hello-world-demo" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Alice and I'm building a weather app for surfers. What tech stack would you recommend?",
  });
  const reply1 = await chat(toMessageParams(dialogue), toSystemPrompt(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Claude: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Good ideas. I also want tide predictions and wave height data. What APIs should I look at?",
  });
  const reply2 = await chat(toMessageParams(dialogue), toSystemPrompt(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - Claude: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - Claude should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  });
  const reply3 = await chat(toMessageParams(resumed), toSystemPrompt(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Claude:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("alice") &&
    (lower.includes("surf") || lower.includes("wave") || lower.includes("tide"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
