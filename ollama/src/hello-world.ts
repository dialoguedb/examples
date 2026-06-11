/**
 * Hello World - DialogueDB + Ollama
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with a local Ollama model, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - the model has full context from before the restart
 *
 * Ollama runs LLMs locally (llama3, mistral, qwen, etc). It's stateless per
 * request, so you must pass the full message history each time. DialogueDB
 * persists that history in the cloud so local chats survive process restarts,
 * different devices, or multiple local-agent instances sharing memory.
 */

import { Ollama } from "ollama";
import type { Message as OllamaMessage } from "ollama";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
});
const db = new DialogueDB();
const MODEL = process.env.OLLAMA_MODEL || "llama3.2";

/** Send a message array to the local model, return the text response. */
async function chat(messages: OllamaMessage[]): Promise<string> {
  const response = await ollama.chat({
    model: MODEL,
    messages,
    stream: false,
  });
  return response.message.content;
}

/** Convert DialogueDB messages to Ollama format. */
function toOllamaMessages(dialogue: Dialogue): OllamaMessage[] {
  return dialogue.messages.map((m) => ({
    role: m.role,
    content: m.content as string,
  }));
}

async function main() {
  console.log("=== DialogueDB + Ollama: Hello World ===\n");
  console.log(`Using model: ${MODEL}`);
  console.log(`Host: ${process.env.OLLAMA_HOST || "http://127.0.0.1:11434"}\n`);

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "ollama-hello-world",
    state: { provider: "ollama", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Priya and I'm building a privacy-first journaling app " +
      "that runs all AI features locally. What tech stack would you recommend?",
  });
  const reply1 = await chat(toOllamaMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - ${MODEL}: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "I also want sentiment analysis on entries without sending them to the cloud. How should I approach that?",
  });
  const reply2 = await chat(toOllamaMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - ${MODEL}: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB.
  // In a real local-AI app, this is what happens when the user quits and
  // relaunches, or opens the same conversation on a second device.
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - the model should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  });
  const reply3 = await chat(toOllamaMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - ${MODEL}:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("journal") || lower.includes("sentiment") || lower.includes("privacy"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
