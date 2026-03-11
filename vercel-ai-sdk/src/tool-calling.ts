/**
 * Tool Calling — DialogueDB + Vercel AI SDK
 *
 * Demonstrates the full integration with Vercel AI SDK's tool system:
 * - Define tools with Zod schemas (the Vercel AI SDK way)
 * - Use `generateText` with `maxSteps` for automatic tool execution
 * - Persist every message (including tool calls/results) to DialogueDB
 * - Cold resume from a fresh process — Claude retains full tool context
 */

import { generateText, type CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const model = anthropic("claude-sonnet-4-20250514");

// --- Tool definitions using Zod (Vercel AI SDK pattern) ---

const tools = {
  getWeather: {
    description: "Get current weather for a location",
    parameters: z.object({
      location: z.string().describe("City name"),
    }),
    execute: async ({ location }: { location: string }) => {
      const temps: Record<string, number> = {
        "san francisco": 62,
        "new york": 45,
        london: 52,
        tokyo: 58,
        paris: 55,
      };
      const temp = temps[location.toLowerCase()] ?? 70;
      return {
        location,
        temperature_f: temp,
        condition: temp > 60 ? "Sunny" : "Cloudy",
        humidity: "65%",
      };
    },
  },
  calculate: {
    description: "Perform a mathematical calculation",
    parameters: z.object({
      expression: z
        .string()
        .describe("Math expression to evaluate (e.g. '(72 - 58) * 5/9')"),
    }),
    execute: async ({ expression }: { expression: string }) => {
      try {
        const result = Function(`"use strict"; return (${expression})`)();
        return { expression, result };
      } catch {
        return { error: `Could not evaluate: ${expression}` };
      }
    },
  },
  saveNote: {
    description: "Save a note for later reference",
    parameters: z.object({
      title: z.string().describe("Note title"),
      content: z.string().describe("Note content"),
    }),
    execute: async ({ title }: { title: string; content: string }) => {
      return { saved: true, title };
    },
  },
};

/** Convert DialogueDB messages to CoreMessage format. */
function toCoreMessages(dialogue: Dialogue): CoreMessage[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

// ---------------------------------------------------------------------------
// Invocation 1 — Multi-tool conversation with auto tool execution
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Multi-Tool Conversation ===\n");

  const dialogue = await db.createDialogue({
    label: "vercel-ai-tool-calling",
    state: { invocation: 1, started: new Date().toISOString() },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  const userMessage =
    "I'm planning a trip. Check the weather in San Francisco and Tokyo, " +
    "calculate the temperature difference in Celsius, " +
    "and save a note summarizing the comparison.";

  // Persist the user message before calling the model
  await dialogue.saveMessage({ role: "user", content: userMessage });

  console.log(`[user] ${userMessage}\n`);
  console.log("Running with maxSteps=5 (automatic tool execution)...\n");

  // Vercel AI SDK handles the tool loop automatically via maxSteps
  const result = await generateText({
    model,
    tools,
    maxSteps: 5,
    messages: toCoreMessages(dialogue),
  });

  // Persist each step — the Vercel AI SDK returns all intermediate steps
  for (const step of result.steps) {
    console.log(`  [step] ${step.finishReason}`);
    if (step.toolCalls.length > 0) {
      for (const tc of step.toolCalls) {
        console.log(`    [tool] ${tc.toolName}(${JSON.stringify(tc.args)})`);
      }
    }
  }

  // Persist the final assistant response with usage metadata
  await dialogue.saveMessage({
    role: "assistant",
    content: result.text,
    metadata: {
      steps: result.steps.length,
      finishReason: result.finishReason,
      usage_input: result.usage.promptTokens,
      usage_output: result.usage.completionTokens,
    },
  });

  console.log(`\n[assistant] ${result.text}\n`);

  // Save state for cold resume
  await dialogue.saveState({
    invocation: 1,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  console.log("--- Invocation 1 Summary ---");
  console.log(`Dialogue ID: ${dialogue.id}`);
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(
    `Tokens: ${result.usage.promptTokens} input, ${result.usage.completionTokens} output`
  );
  console.log(`Steps: ${result.steps.length}`);
  console.log("---\n");

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 — Cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  // Load conversation fresh from DialogueDB (simulates a new process)
  console.log(`Loading dialogue ${dialogueId} from scratch...`);
  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages\n`);

  // New follow-up referencing the earlier tool results
  const followUp =
    "Based on our earlier weather comparison, which city would be better " +
    "for outdoor activities this week? Also, what note did you save?";

  await dialogue.saveMessage({ role: "user", content: followUp });

  console.log("Sending follow-up with full context from DialogueDB...\n");

  const result = await generateText({
    model,
    tools,
    maxSteps: 3,
    messages: toCoreMessages(dialogue),
  });

  await dialogue.saveMessage({
    role: "assistant",
    content: result.text,
    metadata: {
      steps: result.steps.length,
      finishReason: result.finishReason,
      usage_input: result.usage.promptTokens,
      usage_output: result.usage.completionTokens,
    },
  });

  console.log(`[assistant] ${result.text}\n`);

  // Update state
  await dialogue.saveState({
    invocation: 2,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  console.log("--- Invocation 2 Summary ---");
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(
    `Tokens: ${result.usage.promptTokens} input, ${result.usage.completionTokens} output`
  );
  console.log("---\n");

  // Cleanup
  await db.deleteDialogue(dialogueId);
  console.log("Cleaned up. Done!");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--invocation="));
  const invocation = flag ? parseInt(flag.split("=")[1]) : 0;

  if (invocation === 1) {
    const id = await invocation1();
    console.log(
      `\nTo run invocation 2:\n  DIALOGUE_ID=${id} npm run tool-calling -- --invocation=2`
    );
  } else if (invocation === 2) {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId) {
      throw new Error("DIALOGUE_ID env var required for invocation 2");
    }
    await invocation2(dialogueId);
  } else {
    // Default: run both back-to-back
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
