/**
 * Hello World — DialogueDB + LangChain
 *
 * Shows the simplest LangChain integration:
 * 1. Create a conversation chain with DialogueDB-backed memory
 * 2. Chat with Claude — every message auto-persisted
 * 3. Simulate a cold restart — new chain, same dialogue ID
 * 4. Continue chatting — Claude has full context from before
 *
 * This is the LangChain equivalent of "save -> load -> model remembers."
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { BufferMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";
import { setGlobalConfig } from "dialogue-db";
import { DialogueChatHistory } from "./lib/dialogue-history.js";
import "dotenv/config";

// -- DialogueDB setup --
setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const MODEL = process.env.MODEL ?? "claude-sonnet-4-20250514";

async function main() {
  console.log("=== DialogueDB + LangChain: Hello World ===\n");

  // 1. Create a DialogueDB-backed message history
  const history = new DialogueChatHistory({ label: "langchain-hello-world" });

  // 2. Wire it into LangChain's BufferMemory
  const memory = new BufferMemory({
    chatHistory: history,
    returnMessages: true,
    memoryKey: "history",
  });

  // 3. Create a conversation chain with Claude
  const llm = new ChatAnthropic({ model: MODEL, maxTokens: 1024 });
  const chain = new ConversationChain({ llm, memory });

  // 4. First exchange — establish memorable context
  console.log("User: Hi! My name is Alice and I'm building a recipe app with voice control.");
  const reply1 = await chain.call({
    input: "Hi! My name is Alice and I'm building a recipe app with voice control.",
  });
  console.log(`Claude: ${(reply1.response as string).slice(0, 200)}...\n`);

  // 5. Follow-up in the same session
  console.log("User: What speech-to-text APIs should I look at for ingredient dictation?");
  const reply2 = await chain.call({
    input: "What speech-to-text APIs should I look at for ingredient dictation?",
  });
  console.log(`Claude: ${(reply2.response as string).slice(0, 200)}...\n`);

  // 6. COLD RESTART — new chain, new memory, same DialogueDB dialogue
  console.log("--- Simulating cold restart ---\n");

  const dialogueId = history.getDialogueId()!;
  console.log(`Dialogue ID: ${dialogueId}`);

  // Build a fresh chain from scratch, pointing at the same dialogue
  const resumedHistory = new DialogueChatHistory({ dialogueId });
  const resumedMemory = new BufferMemory({
    chatHistory: resumedHistory,
    returnMessages: true,
    memoryKey: "history",
  });
  const resumedChain = new ConversationChain({
    llm: new ChatAnthropic({ model: MODEL, maxTokens: 1024 }),
    memory: resumedMemory,
  });

  // 7. Continue — Claude should remember Alice, the recipe app, and voice control
  console.log("User: Quick recap — what's my name, what am I building, and what did we discuss?");
  const reply3 = await resumedChain.call({
    input: "Quick recap — what's my name, what am I building, and what did we discuss?",
  });
  console.log(`Claude (after restart): ${reply3.response}\n`);

  // 8. Verify context was preserved
  const lower = (reply3.response as string).toLowerCase();
  const remembered =
    lower.includes("alice") &&
    (lower.includes("recipe") || lower.includes("voice") || lower.includes("speech"));
  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);

  // Cleanup
  await resumedHistory.clear();
  console.log("Cleaned up. Done!");
}

main().catch(console.error);
