/**
 * Persistent Agent — DialogueDB + Mastra
 *
 * Shows cold resume across separate process invocations:
 *
 * Invocation 1: Agent plans a multi-city trip, every exchange persisted.
 * Invocation 2: New process loads the conversation from DialogueDB and
 *   continues planning — the agent picks up exactly where it left off.
 *
 * Usage:
 *   npm run persistent-agent            # Both invocations back-to-back
 *   npm run persistent-agent -- --inv=1 # Invocation 1 only (prints dialogue ID)
 *   npm run persistent-agent -- --inv=2 # Invocation 2 (needs DIALOGUE_ID env)
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
  id: "trip-planner",
  name: "Trip Planner",
  instructions:
    "You are a trip-planning assistant. Help users compare destinations " +
    "by looking up weather and converting temperatures. When making " +
    "recommendations, reference specifics from earlier in the conversation.",
  model: MODEL,
  tools: { getWeather, convertTemperature },
});

function userMsg(content: string): { role: "user"; content: string } {
  return { role: "user", content };
}

function assistantMsg(content: string): { role: "assistant"; content: string } {
  return { role: "assistant", content };
}

function toMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) => {
    const text =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "user") return userMsg(text);
    return assistantMsg(text);
  });
}

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

// ---------------------------------------------------------------------------
// Invocation 1 — Start planning a trip
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Plan a Multi-City Trip ===\n");

  const dialogue = await db.createDialogue({
    label: "mastra-trip-planner",
    state: {
      provider: "openai",
      framework: "mastra",
      model: MODEL,
      invocation: 1,
      started: new Date().toISOString(),
    },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  const reply1 = await chat(
    dialogue,
    "I'm planning a December trip. Check the weather in Tokyo and Sydney " +
      "and tell me which is warmer."
  );
  console.log(`Agent: ${reply1}\n`);

  const reply2 = await chat(
    dialogue,
    "Convert Sydney's temperature to Fahrenheit. Also check Paris — " +
      "I'm considering it as a third option."
  );
  console.log(`Agent: ${reply2}\n`);

  await dialogue.saveState({
    provider: "openai",
    framework: "mastra",
    model: MODEL,
    invocation: 1,
    completed: true,
    messageCount: dialogue.messages.length,
  });

  console.log("--- Invocation 1 Summary ---");
  console.log(`Dialogue ID: ${dialogue.id}`);
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log("---\n");

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 — Resume from cold storage
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Resume Trip Planning ===\n");

  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);
  await dialogue.loadMessages({ order: "asc" });
  console.log(
    `Loaded ${dialogue.messages.length} messages from previous session\n`
  );

  const reply = await chat(
    dialogue,
    "Based on everything we discussed, rank the three cities from warmest " +
      "to coldest and give me your top pick for a beach-friendly December trip."
  );
  console.log(`Agent: ${reply}\n`);

  await dialogue.saveState({
    provider: "openai",
    framework: "mastra",
    model: MODEL,
    invocation: 2,
    completed: true,
    messageCount: dialogue.messages.length,
  });

  console.log("--- Invocation 2 Summary ---");
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log("---\n");

  await db.deleteDialogue(dialogueId);
  console.log("Cleaned up. Done!");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const invFlag = process.argv.find((a) => a.startsWith("--inv="));
  const invocation = invFlag ? parseInt(invFlag.split("=")[1]) : 0;

  if (invocation === 1) {
    const id = await invocation1();
    console.log(
      `To resume:\n  DIALOGUE_ID=${id} npm run persistent-agent -- --inv=2`
    );
  } else if (invocation === 2) {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId) {
      throw new Error("DIALOGUE_ID env var required for invocation 2");
    }
    await invocation2(dialogueId);
  } else {
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
