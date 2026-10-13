/**
 * Hello World - DialogueDB + Portkey AI Gateway
 *
 * Portkey provides a unified API to 250+ LLM providers (OpenAI, Anthropic,
 * Google, Mistral, etc.) with built-in reliability and observability.
 * DialogueDB persists conversations across sessions and providers.
 *
 * 1. Create a conversation in DialogueDB
 * 2. Chat through Portkey's AI gateway, saving every message
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — the LLM has full context from before the restart
 */

import Portkey from "portkey-ai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const portkey = new Portkey({
  apiKey: process.env.PORTKEY_API_KEY,
  virtualKey: process.env.PORTKEY_VIRTUAL_KEY,
});

const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

/** Send the conversation to an LLM through Portkey, return the text response. */
async function chat(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await portkey.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages,
  });
  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Expected a text response from the LLM");
  }
  return content;
}

/** Convert DialogueDB messages to the format Portkey expects. */
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
  console.log("=== DialogueDB + Portkey AI Gateway: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "portkey-hello-world",
    state: { gateway: "portkey", format: "openai-chat", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! I'm Priya and I'm building a multi-language translation app that supports real-time translation for 12 languages. What architecture would you recommend?",
  });
  const reply1 = await chat(toMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - LLM: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "I also need offline mode so translations work without internet. How should I handle model packaging and caching for that?",
  });
  const reply2 = await chat(toMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - LLM: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation — LLM should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what features did we discuss?",
  });
  const reply3 = await chat(toMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - LLM:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("translat") || lower.includes("language"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
