/**
 * Hello World - DialogueDB + Groq SDK
 *
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Llama via Groq's ultra-fast inference
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — Llama has full context from before the restart
 */

import Groq from "groq-sdk";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const groq = new Groq();
const db = new DialogueDB();
const MODEL = "llama-3.3-70b-versatile";

async function chat(
  messages: Groq.Chat.ChatCompletionMessageParam[]
): Promise<string> {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages,
  });
  return response.choices[0].message.content ?? "";
}

function toGroqMessages(
  dialogue: Dialogue
): Groq.Chat.ChatCompletionMessageParam[] {
  return dialogue.messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.content),
  }));
}

async function main() {
  console.log("=== DialogueDB + Groq SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "groq-hello-world",
    state: { provider: "groq", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! I'm Priya and I'm building a real-time translation app for multilingual classrooms. What tech stack would you recommend?",
  });
  const reply1 = await chat(toGroqMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Llama: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up
  await dialogue.saveMessage({
    role: "user",
    content:
      "I also need offline support for areas with spotty internet. How would you handle that?",
  });
  const reply2 = await chat(toGroqMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - Llama: ${reply2.slice(0, 150)}...\n`);

  // 4. Cold restart — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue — Llama should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what features did we discuss?",
  });
  const reply3 = await chat(toGroqMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Llama:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("translation") || lower.includes("multilingual"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
