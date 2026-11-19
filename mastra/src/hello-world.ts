/**
 * Hello World — DialogueDB + Mastra
 *
 * Shows the simplest integration:
 * 1. Create a Mastra agent with tools
 * 2. Chat and persist every exchange to DialogueDB
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — the agent has full context from before the restart
 */

import { Agent } from "@mastra/core/agent";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { getWeather, convertTemperature } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const MODEL = "openai/gpt-4o-mini";

const agent = new Agent({
  id: "travel-assistant",
  name: "Travel Assistant",
  instructions:
    "You are a concise travel assistant. Use your tools to look up weather " +
    "and convert temperatures when asked. Keep answers to two or three sentences.",
  model: MODEL,
  tools: { getWeather, convertTemperature },
});

function userMsg(content: string): { role: "user"; content: string } {
  return { role: "user", content };
}

function assistantMsg(content: string): { role: "assistant"; content: string } {
  return { role: "assistant", content };
}

/** Build the message array the agent expects from DialogueDB history. */
function toMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) => {
    const text =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "user") return userMsg(text);
    return assistantMsg(text);
  });
}

/** Send a user message, get the agent response, and persist both. */
async function chat(dialogue: Dialogue, userMessage: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  const history = toMessages(dialogue);
  const result = await agent.generate(history);

  await dialogue.saveMessage({
    role: "assistant",
    content: result.text,
    metadata: {
      finishReason: result.finishReason ?? "unknown",
      steps: result.steps.length,
    },
  });

  return result.text;
}

async function main() {
  console.log("=== DialogueDB + Mastra: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "mastra-hello-world",
    state: { provider: "openai", framework: "mastra", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — the agent uses tools to look up weather
  const reply1 = await chat(
    dialogue,
    "What's the weather like in Tokyo right now? Also convert 22 Celsius to Fahrenheit for me."
  );
  console.log(`Exchange 1:\n${reply1}\n`);

  // 3. Follow-up referencing prior context
  const reply2 = await chat(
    dialogue,
    "And how does that compare to London? Should I pack a jacket?"
  );
  console.log(`Exchange 2:\n${reply2}\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation — the agent should remember everything
  const reply3 = await chat(
    resumed,
    "Quick recap: which cities did we discuss and what were their temperatures?"
  );
  console.log(`Exchange 3 (after restart):\n${reply3}\n`);

  // Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered = lower.includes("tokyo") && lower.includes("london");
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
