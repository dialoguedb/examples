/**
 * Hello World — DialogueDB + Replicate (Meta Llama)
 *
 * Shows how to persist conversations with open-source models running on Replicate:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Llama via Replicate, saving every message
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — Llama has full context from before the restart
 *
 * Replicate doesn't have a built-in chat history API, so DialogueDB handles
 * all the persistence. You load the history, format it into the prompt, and send.
 */

import Replicate from "replicate";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const replicate = new Replicate();
const db = new DialogueDB();
const MODEL = "meta/meta-llama-3.1-8b-instruct";

/**
 * Build a prompt string from conversation history.
 * Replicate's Llama models accept a `prompt` (latest user message)
 * and `system_prompt` (instructions + prior context).
 */
function buildSystemPrompt(
  messages: Array<{ role: string; content: string }>
): string {
  const history = messages.slice(0, -1);
  if (history.length === 0) {
    return "You are a helpful assistant.";
  }
  const historyText = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  return `You are a helpful assistant.\n\nConversation so far:\n${historyText}\n\nContinue the conversation naturally.`;
}

/** Send messages to Llama on Replicate, return the text response. */
async function chat(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const lastMessage = messages[messages.length - 1];
  const input = {
    prompt: lastMessage.content,
    system_prompt: buildSystemPrompt(messages),
    max_new_tokens: 1024,
  };

  const output = await replicate.run(MODEL, { input });

  if (Array.isArray(output)) {
    return output.join("");
  }
  return String(output);
}

/** Convert DialogueDB messages to plain objects for the chat function. */
function toMessages(
  dialogue: Dialogue
): Array<{ role: string; content: string }> {
  return dialogue.messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));
}

async function main() {
  console.log("=== DialogueDB + Replicate (Llama 3.1): Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "replicate-hello-world",
    state: { provider: "replicate", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Jordan and I'm building a fitness tracking app that uses AI to generate personalized workout plans. What architecture would you suggest?",
  });
  const reply1 = await chat(toMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 — Llama: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Great suggestions. I also want to add real-time heart rate monitoring and recovery recommendations. How would you extend that?",
  });
  const reply2 = await chat(toMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 — Llama: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation — Llama should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  });
  const reply3 = await chat(toMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) — Llama:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("jordan") &&
    (lower.includes("fitness") ||
      lower.includes("workout") ||
      lower.includes("heart rate"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
