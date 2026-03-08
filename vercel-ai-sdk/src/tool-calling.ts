/**
 * Tool Calling — DialogueDB + Vercel AI SDK
 *
 * Shows how to persist multi-step tool-calling conversations:
 * 1. Define tools using Vercel AI SDK's tool() helper with Zod schemas
 * 2. Run generateText with maxSteps so the SDK handles the tool loop
 * 3. Persist every step (user, assistant, tool calls, tool results) to DialogueDB
 * 4. Cold restart — load and continue with full tool history
 *
 * The Vercel AI SDK auto-executes tools and loops until the model is done.
 * DialogueDB captures the full trace so you can resume, audit, or replay.
 */

import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { z } from "zod";
import "dotenv/config";

// -- DialogueDB setup --
setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const model = anthropic("claude-sonnet-4-20250514");

// -- Tools --
const tools = {
  get_weather: tool({
    description: "Get current weather for a city",
    parameters: z.object({
      city: z.string().describe("City name"),
    }),
    execute: async ({ city }) => {
      // Simulated weather data
      const data: Record<string, { temp: number; condition: string }> = {
        "san francisco": { temp: 16, condition: "foggy" },
        tokyo: { temp: 28, condition: "sunny" },
        london: { temp: 12, condition: "rainy" },
        sydney: { temp: 22, condition: "partly cloudy" },
      };
      const weather = data[city.toLowerCase()] ?? { temp: 20, condition: "unknown" };
      return `${city}: ${weather.temp}°C, ${weather.condition}`;
    },
  }),
  calculate: tool({
    description: "Perform a math calculation",
    parameters: z.object({
      expression: z.string().describe("Math expression to evaluate, e.g. '28 - 16'"),
    }),
    execute: async ({ expression }) => {
      // Simple safe eval for basic arithmetic
      const result = Function(`"use strict"; return (${expression})`)();
      return `${expression} = ${result}`;
    },
  }),
  save_note: tool({
    description: "Save a note for the user",
    parameters: z.object({
      title: z.string().describe("Note title"),
      content: z.string().describe("Note content"),
    }),
    execute: async ({ title, content }) => {
      return `Saved note "${title}": ${content}`;
    },
  }),
};

/** Convert DialogueDB messages to Vercel AI SDK format. */
function toAIMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

/**
 * Run a conversation turn with tool calling.
 * Vercel AI SDK handles the tool loop via maxSteps.
 * We persist the final messages to DialogueDB.
 */
async function chatWithTools(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  // Save user message to DialogueDB
  await dialogue.saveMessage({ role: "user", content: userMessage });

  const result = await generateText({
    model,
    tools,
    maxSteps: 5, // Allow up to 5 tool-calling rounds
    system:
      "You are a helpful assistant with tools. Use them when needed. Be concise.",
    messages: toAIMessages(dialogue),
  });

  // Log each step's tool calls
  for (const step of result.steps) {
    if (step.toolCalls.length > 0) {
      for (const tc of step.toolCalls) {
        console.log(`   [tool] ${tc.toolName}(${JSON.stringify(tc.args)})`);
      }
    }
    if (step.toolResults.length > 0) {
      for (const tr of step.toolResults) {
        console.log(`   [result] ${tr.result}`);
      }
    }
  }

  // Persist the assistant's final text response
  // We also store tool call metadata for auditability
  const toolCalls = result.steps.flatMap((s) =>
    s.toolCalls.map((tc) => ({
      tool: tc.toolName,
      args: tc.args,
    }))
  );

  await dialogue.saveMessage({
    role: "assistant",
    content: result.text,
    metadata: {
      steps: result.steps.length,
      toolCalls: JSON.stringify(toolCalls),
      totalTokens: result.usage.totalTokens,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    },
  });

  return result.text;
}

async function main() {
  console.log("=== DialogueDB + Vercel AI SDK: Tool Calling ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "vercel-ai-tool-demo",
    state: { started: new Date().toISOString() },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First turn — triggers multiple tool calls
  console.log("Turn 1: Multi-tool query...\n");
  const reply1 = await chatWithTools(
    dialogue,
    "Compare the weather in San Francisco and Tokyo. " +
      "Calculate the temperature difference. " +
      "Then save a note summarizing which city is warmer."
  );
  console.log(`\nClaude: ${reply1}\n`);

  // 3. Save conversation state
  await dialogue.saveState({
    turns: 1,
    totalMessages: dialogue.messages.length,
  });

  // 4. COLD RESTART — load from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB`);
  console.log(`Dialogue state: ${JSON.stringify(resumed.state)}\n`);

  // 5. Continue with full context
  console.log("Turn 2: Follow-up after restart...\n");
  const reply2 = await chatWithTools(
    resumed,
    "Now also check London's weather and compare all three cities. " +
      "Which is best for a picnic?"
  );
  console.log(`\nClaude: ${reply2}\n`);

  // 6. Summary
  console.log("--- Summary ---");
  console.log(`Total messages persisted: ${resumed.messages.length}`);
  console.log(`Conversation survived cold restart: YES`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
