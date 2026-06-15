/**
 * Hello World - DialogueDB + Cohere SDK (v2 Chat API)
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Command R+, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Command R+ has full context from before the restart
 *
 * No tools, no state management. Just: save -> load -> Command R+ remembers.
 */

import { CohereClientV2 } from "cohere-ai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const cohere = new CohereClientV2({
  token: process.env.COHERE_API_KEY!,
});
const db = new DialogueDB();
const MODEL = "command-a-03-2025";

/** Send a message array to Cohere, return the text response. */
async function chat(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const response = await cohere.chat({
    model: MODEL,
    messages,
  });
  const firstBlock = response.message?.content?.[0];
  if (firstBlock && firstBlock.type === "text") {
    return firstBlock.text;
  }
  return "";
}

/** Convert DialogueDB messages to Cohere format. */
function toCohereMessages(
  dialogue: Dialogue
): Array<{ role: "user" | "assistant"; content: string }> {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

async function main() {
  console.log("=== DialogueDB + Cohere SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "cohere-hello-world" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Priya and I'm building a language learning app that uses AI to generate practice conversations. What features would you recommend?",
  });
  const reply1 = await chat(toCohereMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Command R+: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Great ideas. I also want to support pronunciation feedback and cultural context notes. How would you integrate those?",
  });
  const reply2 = await chat(toCohereMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - Command R+: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - Command R+ should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  });
  const reply3 = await chat(toCohereMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Command R+:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("language") ||
      lower.includes("pronunciation") ||
      lower.includes("cultural"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
