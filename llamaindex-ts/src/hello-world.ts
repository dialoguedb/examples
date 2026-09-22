/**
 * Hello World - DialogueDB + LlamaIndex
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with OpenAI through LlamaIndex's SimpleChatEngine
 * 3. Simulate a cold restart — load the conversation fresh from DialogueDB
 * 4. Rebuild the engine with loaded history — the LLM has full context
 */

import { OpenAI } from "@llamaindex/openai";
import { SimpleChatEngine, createMemory } from "llamaindex";
import type { ChatMessage } from "llamaindex";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { toLlamaMessages, saveLlamaMessage } from "./persist.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
const llm = new OpenAI({ model: "gpt-4o-mini" });

/** Chat and persist: send a message, save both the user turn and the response. */
async function chatAndPersist(
  engine: SimpleChatEngine,
  dialogue: Awaited<ReturnType<DialogueDB["createDialogue"]>>,
  message: string,
): Promise<string> {
  const response = await engine.chat({ message });
  const replyText = response.message.content.toString();

  // Persist both sides of the exchange to DialogueDB
  await saveLlamaMessage(dialogue, { role: "user", content: message });
  await saveLlamaMessage(dialogue, { role: "assistant", content: replyText });

  return replyText;
}

async function main() {
  console.log("=== DialogueDB + LlamaIndex: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "llamaindex-hello-world" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish memorable context
  const engine = new SimpleChatEngine({ llm });
  const reply1 = await chatAndPersist(
    engine,
    dialogue,
    "Hi! My name is Alice and I'm building a weather app for surfers. What tech stack would you recommend?",
  );
  console.log(`Exchange 1 — LLM: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  const reply2 = await chatAndPersist(
    engine,
    dialogue,
    "Good ideas. I also want tide predictions and wave height data. What APIs should I look at?",
  );
  console.log(`Exchange 2 — LLM: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // Rebuild engine with loaded history
  const loadedMessages: ChatMessage[] = toLlamaMessages(resumed);
  const restoredEngine = new SimpleChatEngine({
    llm,
    memory: createMemory(loadedMessages),
  });

  // 5. Continue the conversation — the LLM should have full context
  const reply3 = await chatAndPersist(
    restoredEngine,
    resumed,
    "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  );
  console.log(`Exchange 3 (after restart) — LLM:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("alice") &&
    (lower.includes("surf") || lower.includes("wave") || lower.includes("tide"));
  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
