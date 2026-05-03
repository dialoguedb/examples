/**
 * DialogueDB + Mastra Agent
 *
 * Shows how to use DialogueDB as a portable conversation store for Mastra agents:
 * 1. Create a Mastra agent with tools
 * 2. Chat with the agent, persisting every exchange to DialogueDB
 * 3. Simulate a cold restart — load conversation fresh from DialogueDB
 * 4. Continue chatting — the agent has full context from before
 *
 * Why DialogueDB instead of Mastra's built-in memory?
 * - Works across services (your Mastra agent, your API, your dashboard)
 * - Conversations accessible via REST API from any language
 * - Survives infrastructure changes — not tied to Mastra's storage layer
 */

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();

// -- Tools --

const getWeather = createTool({
  id: "get_weather",
  description: "Get current weather for a city",
  inputSchema: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async (input) => {
    const temps: Record<string, number> = {
      "san francisco": 18,
      tokyo: 26,
      london: 14,
      "new york": 22,
      paris: 19,
    };
    const city = input.city.toLowerCase();
    const temp = temps[city] ?? Math.floor(Math.random() * 30) + 5;
    return { city: input.city, temp_celsius: temp, condition: temp > 20 ? "sunny" : "cloudy" };
  },
});

const saveNote = createTool({
  id: "save_note",
  description: "Save a note for the user",
  inputSchema: z.object({
    title: z.string().describe("Note title"),
    content: z.string().describe("Note content"),
  }),
  execute: async (input) => {
    return { saved: true, title: input.title, timestamp: new Date().toISOString() };
  },
});

// -- Agent --

const agent = new Agent({
  id: "travel-assistant",
  name: "Travel Assistant",
  instructions:
    "You are a helpful travel assistant. Use your tools to look up weather " +
    "and save notes for the user. Be concise and friendly.",
  model: "openai/gpt-4o-mini",
  tools: { getWeather, saveNote },
});

// -- DialogueDB helpers --

interface Message {
  role: "user" | "assistant";
  content: string;
}

function toMessages(dialogue: Dialogue): Message[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

async function chat(dialogue: Dialogue, userMessage: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  // Build message history from DialogueDB and send to agent
  const messages = toMessages(dialogue);
  const response = await agent.generate(messages);

  await dialogue.saveMessage({
    role: "assistant",
    content: response.text,
    metadata: {
      toolCalls: response.toolCalls?.length ?? 0,
      finishReason: response.finishReason ?? "stop",
    },
  });

  return response.text;
}

// -- Main --

async function main() {
  console.log("=== DialogueDB + Mastra Agent ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "mastra-travel-assistant",
    state: { framework: "mastra", model: "gpt-4o-mini" },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish context
  console.log("User: Hi! I'm planning a trip to Tokyo and San Francisco next month.");
  const reply1 = await chat(
    dialogue,
    "Hi! I'm planning a trip to Tokyo and San Francisco next month. " +
      "Can you check the weather in both cities?"
  );
  console.log(`Agent: ${reply1}\n`);

  // 3. Follow-up
  console.log("User: Save a note with a packing recommendation based on those temperatures.");
  const reply2 = await chat(
    dialogue,
    "Save a note with a packing recommendation based on those temperatures."
  );
  console.log(`Agent: ${reply2}\n`);

  // 4. COLD RESTART — load from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue — agent should remember the trip context
  console.log("User: Which city should I visit first based on our earlier discussion?");
  const reply3 = await chat(
    resumed,
    "Which city should I visit first based on our earlier discussion? " +
      "Remind me what we talked about."
  );
  console.log(`Agent (after restart): ${reply3}\n`);

  // 6. Verify
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("tokyo") || lower.includes("san francisco") || lower.includes("weather");
  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
