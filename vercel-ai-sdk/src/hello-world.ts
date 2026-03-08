/**
 * Hello World — DialogueDB + Vercel AI SDK
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Claude via Vercel AI SDK's generateText()
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — Claude has full context from before the restart
 *
 * The Vercel AI SDK gives you a clean, provider-agnostic API for LLMs.
 * DialogueDB gives you persistence. Together: stateless processes,
 * stateful conversations.
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

// -- DialogueDB setup --
setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();

// -- Vercel AI SDK model --
const model = anthropic("claude-sonnet-4-20250514");

/** Convert DialogueDB messages to Vercel AI SDK format. */
function toAIMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

/** Send a message, get a response, persist both to DialogueDB. */
async function chat(dialogue: Dialogue, userMessage: string): Promise<string> {
  // Save the user message
  await dialogue.saveMessage({ role: "user", content: userMessage });

  // Call the LLM with full conversation history
  const { text } = await generateText({
    model,
    messages: toAIMessages(dialogue),
  });

  // Save the assistant response
  await dialogue.saveMessage({ role: "assistant", content: text });

  return text;
}

async function main() {
  console.log("=== DialogueDB + Vercel AI SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "vercel-ai-hello-world" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish memorable context
  const reply1 = await chat(
    dialogue,
    "Hi! My name is Marcus and I'm building a recipe app that suggests meals " +
      "based on what's in your fridge. What architecture would you recommend?"
  );
  console.log(`Exchange 1 — Claude: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  const reply2 = await chat(
    dialogue,
    "Great ideas. I also want barcode scanning so users can log groceries " +
      "automatically. Any libraries for that?"
  );
  console.log(`Exchange 2 — Claude: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation — Claude should remember everything
  const reply3 = await chat(
    resumed,
    "Quick recap: what's my name, what am I building, and what features " +
      "did we discuss?"
  );
  console.log(`Exchange 3 (after restart) — Claude:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("marcus") &&
    (lower.includes("recipe") ||
      lower.includes("fridge") ||
      lower.includes("barcode"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
