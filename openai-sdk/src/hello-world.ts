/**
 * Hello World - DialogueDB + OpenAI SDK
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with GPT, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - GPT has full context from before the restart
 *
 * No tools, no state management. Just: save -> load -> GPT remembers.
 */

import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

/** Send a message array to GPT, return the text response. */
async function chat(
  messages: OpenAI.ChatCompletionMessageParam[]
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages,
  });
  return response.choices[0].message.content ?? "";
}

/** Convert DialogueDB messages to OpenAI format. */
function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

async function main() {
  console.log("=== DialogueDB + OpenAI SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "openai-hello-world" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Marcus and I'm building a recipe recommendation app that uses AI to suggest meals based on dietary restrictions. What architecture would you suggest?",
  });
  const reply1 = await chat(toOpenAIMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - GPT: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Great suggestions. I also want to support meal prep scheduling and grocery list generation. How would you extend the architecture for those?",
  });
  const reply2 = await chat(toOpenAIMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - GPT: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - GPT should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  });
  const reply3 = await chat(toOpenAIMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - GPT:\n${reply3}\n`);

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
