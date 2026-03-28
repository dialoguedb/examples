/**
 * Hello World - DialogueDB + Mistral SDK
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
import type { Messages } from "@mistralai/mistralai/models/components/chatcompletionrequest.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });
const db = new DialogueDB();
const MODEL = "mistral-small-latest";

/** Send a message array to Mistral, return the text response. */
async function chat(messages: Messages[]): Promise<string> {
  const response = await mistral.chat.complete({
    model: MODEL,
    maxTokens: 1024,
    messages,
  });
  return response.choices?.[0].message.content?.toString() ?? "";
}

/** Convert DialogueDB messages to Mistral format. */
function toMistralMessages(dialogue: Dialogue): Messages[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

async function main() {
  console.log("=== DialogueDB + Mistral SDK: Hello World ===\n");

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
      "Hi! My name is Elara and I'm building a language learning app " +
      "that uses AI to generate contextual practice exercises. " +
      "What architecture would you suggest?",
  });
  const reply1 = await chat(toMistralMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Mistral: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Great suggestions. I also want to support spaced repetition " +
      "and pronunciation feedback. How would you extend the architecture?",
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
      "Quick recap: what's my name, what am I building, " +
      "and what specific features did we discuss?",
  });
  const reply3 = await chat(toMistralMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Mistral:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("elara") &&
    (lower.includes("language") || lower.includes("learning") || lower.includes("practice"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
