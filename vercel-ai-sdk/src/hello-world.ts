/**
 * Hello World - DialogueDB + Vercel AI SDK
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat using Vercel AI SDK's generateText, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - the model has full context from before the restart
 *
 * The Vercel AI SDK provides a unified interface across AI providers.
 * DialogueDB adds persistence so conversations survive restarts, deploys,
 * and cold starts — whether you're running in a serverless function,
 * edge worker, or long-running server.
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
const model = anthropic("claude-sonnet-4-20250514");

/**
 * Send a message and get a response, using the full conversation history
 * from DialogueDB as context. Every exchange is persisted automatically.
 */
async function chat(dialogue: Dialogue, userMessage: string): Promise<string> {
  // Save the user message to DialogueDB
  await dialogue.saveMessage({ role: "user", content: userMessage });

  // Build messages array from DialogueDB's persisted history
  const messages = dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));

  // Call the model via Vercel AI SDK
  const { text, usage } = await generateText({ model, messages });

  // Save the assistant response with token usage metadata
  await dialogue.saveMessage({
    role: "assistant",
    content: text,
    metadata: {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    },
  });

  return text;
}

async function main() {
  console.log("=== DialogueDB + Vercel AI SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "vercel-ai-hello-world",
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish context
  const reply1 = await chat(
    dialogue,
    "Hi! My name is Jordan and I'm building a recipe app " +
      "that suggests meals based on what's in your fridge. " +
      "What features would make it stand out?"
  );
  console.log(`Exchange 1 - Model: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  const reply2 = await chat(
    dialogue,
    "Great ideas. I especially like the dietary restriction angle. " +
      "What food APIs or databases should I integrate with?"
  );
  console.log(`Exchange 2 - Model: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  //    This simulates a new serverless invocation, edge function,
  //    or server restart where all in-memory state is gone.
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - the model should have full context
  const reply3 = await chat(
    resumed,
    "Quick recap: what's my name, what am I building, " +
      "and what was the key feature you recommended?"
  );
  console.log(`Exchange 3 (after restart) - Model:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("jordan") &&
    (lower.includes("recipe") ||
      lower.includes("fridge") ||
      lower.includes("meal"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
