/**
 * Hello World - DialogueDB + Cohere SDK (V2 Chat API)
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Command, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Command has full context from before the restart
 *
 * No tools, no state management. Just: save -> load -> Command remembers.
 */

import { CohereClientV2 } from "cohere-ai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const cohere = new CohereClientV2({});
const db = new DialogueDB();
const MODEL = "command-a-03-2025";

/** Send messages to Cohere Command and return the text response. */
async function chat(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const response = await cohere.chat({ model: MODEL, messages });
  const blocks = response.message?.content;
  if (!blocks) return "";
  let text = "";
  for (const block of blocks) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text;
}

/** Convert DialogueDB messages to the format Cohere's V2 API expects. */
function toCohereMessages(
  dialogue: Dialogue
): Array<{ role: "user" | "assistant"; content: string }> {
  const result: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of dialogue.messages) {
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "user" || m.role === "assistant") {
      result.push({ role: m.role, content });
    }
  }
  return result;
}

async function main() {
  console.log("=== DialogueDB + Cohere SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "cohere-hello-world",
    state: { provider: "cohere", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Priya and I'm building a language-learning app that uses AI to generate practice conversations. What approach would you recommend?",
  });
  const reply1 = await chat(toCohereMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Command: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Good ideas. I want to support Spanish, Japanese, and French. How should I handle grammar correction and difficulty levels?",
  });
  const reply2 = await chat(toCohereMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - Command: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - Command should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what languages did we discuss?",
  });
  const reply3 = await chat(toCohereMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Command:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("language") ||
      lower.includes("spanish") ||
      lower.includes("japanese"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
