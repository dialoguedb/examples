/**
 * Hello World - DialogueDB + Mistral AI SDK
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Mistral, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Mistral has full context from before the restart
 */

import { Mistral } from "@mistralai/mistralai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY ?? "",
});
const db = new DialogueDB();
const MODEL = "mistral-large-latest";

type Message =
  | { role: "user"; content: string | null }
  | { role: "assistant"; content: string | null };

async function chat(messages: Message[]): Promise<string> {
  const response = await mistral.chat.complete({
    model: MODEL,
    maxTokens: 1024,
    messages,
  });
  const content = response.choices[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function toMistralMessages(dialogue: Dialogue): Message[] {
  const messages: Message[] = [];
  for (const m of dialogue.messages) {
    const content = typeof m.content === "string" ? m.content : null;
    if (m.role === "user") {
      messages.push({ role: "user", content });
    } else if (m.role === "assistant") {
      messages.push({ role: "assistant", content });
    }
  }
  return messages;
}

async function main() {
  console.log("=== DialogueDB + Mistral AI SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "mistral-hello-world",
    state: { provider: "mistral", format: "mistral-chat", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Elara and I'm building a multi-language learning app that uses AI to generate contextual vocabulary exercises. What architecture would you suggest?",
  });
  const reply1 = await chat(toMistralMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Mistral: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Great ideas. I also want to add spaced repetition and pronunciation feedback. How would you extend the architecture for those?",
  });
  const reply2 = await chat(toMistralMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - Mistral: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - Mistral should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  });
  const reply3 = await chat(toMistralMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Mistral:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("elara") &&
    (lower.includes("language") ||
      lower.includes("vocabulary") ||
      lower.includes("learning"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
