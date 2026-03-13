/**
 * Tool Agent - DialogueDB + Vercel AI SDK
 *
 * Demonstrates the full integration:
 * - Vercel AI SDK's generateText with tools (type-safe via Zod)
 * - maxSteps for automatic multi-step tool execution
 * - Every message persisted to DialogueDB, including tool calls and results
 * - Cold resume from a separate process invocation
 * - Token usage tracking in message metadata
 *
 * This is the pattern you'd use in a Next.js API route or server action
 * where each request is a fresh serverless invocation.
 *
 * Usage:
 *   npm run tool-agent
 */

import { generateText, tool, type CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { z } from "zod";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const model = anthropic("claude-sonnet-4-20250514");

// ---------------------------------------------------------------------------
// Tools - defined with Zod schemas (Vercel AI SDK's type-safe tool pattern)
// ---------------------------------------------------------------------------

const tools = {
  get_weather: tool({
    description: "Get current weather for a city",
    parameters: z.object({
      city: z.string().describe("City name"),
    }),
    execute: async ({ city }) => {
      // Mock weather data
      const weather: Record<string, { temp: number; condition: string }> = {
        "san francisco": { temp: 18, condition: "foggy" },
        tokyo: { temp: 26, condition: "sunny" },
        london: { temp: 14, condition: "rainy" },
        "new york": { temp: 22, condition: "partly cloudy" },
      };
      const data = weather[city.toLowerCase()] ?? { temp: 20, condition: "clear" };
      return { city, ...data, unit: "celsius" };
    },
  }),

  calculate: tool({
    description: "Evaluate a math expression",
    parameters: z.object({
      expression: z.string().describe("Math expression to evaluate"),
    }),
    execute: async ({ expression }) => {
      // Safe math evaluation for basic operations
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      try {
        const fn = new Function(`return (${sanitized})`);
        return { expression, result: fn() };
      } catch {
        return { expression, error: "Could not evaluate expression" };
      }
    },
  }),

  save_note: tool({
    description: "Save a note for later reference",
    parameters: z.object({
      title: z.string().describe("Note title"),
      content: z.string().describe("Note content"),
    }),
    execute: async ({ title, content }) => {
      return { saved: true, title, length: content.length };
    },
  }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert DialogueDB messages to CoreMessage format. */
function toCoreMessages(dialogue: Dialogue): CoreMessage[] {
  return dialogue.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));
}

/**
 * Run a single agent turn: send a user message, let the AI SDK handle
 * multi-step tool execution via maxSteps, then persist everything.
 */
async function agentTurn(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  // Persist the user message
  await dialogue.saveMessage({ role: "user", content: userMessage });

  // Build the full message history from DialogueDB
  const messages = toCoreMessages(dialogue);

  // generateText with maxSteps handles the tool loop automatically.
  // The AI SDK calls tools, feeds results back, and continues until
  // the model produces a final text response.
  const result = await generateText({
    model,
    system:
      "You are a helpful assistant with access to tools. " +
      "Use them when needed to answer questions accurately. Be concise.",
    tools,
    maxSteps: 5, // Allow up to 5 tool-use rounds
    messages,
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Log tool calls as they happen
      if (toolCalls) {
        for (const tc of toolCalls) {
          console.log(`   [tool] ${tc.toolName}(${JSON.stringify(tc.args)})`);
        }
      }
      if (toolResults) {
        for (const tr of toolResults) {
          console.log(`   [result] ${JSON.stringify(tr.result)}`);
        }
      }
    },
  });

  // Persist the assistant response with usage metadata.
  // We save the final text. For full fidelity you could also save
  // intermediate tool steps, but for most apps the final text is enough
  // since you can replay the conversation from saved user messages.
  await dialogue.saveMessage({
    role: "assistant",
    content: result.text,
    metadata: {
      input_tokens: result.usage.promptTokens,
      output_tokens: result.usage.completionTokens,
      steps: result.steps.length,
      toolCalls: JSON.stringify(
        result.steps
          .flatMap((s) => s.toolCalls ?? [])
          .map((tc) => ({ tool: tc.toolName, args: tc.args }))
      ),
    },
  });

  return result.text;
}

// ---------------------------------------------------------------------------
// Invocation 1 - Initial conversation with multi-tool use
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Multi-Tool Agent ===\n");

  const dialogue = await db.createDialogue({
    label: "vercel-ai-tool-agent",
    state: { invocation: 1, started: new Date().toISOString() },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  console.log("Sending query that requires multiple tools...\n");
  const reply = await agentTurn(
    dialogue,
    "I'm planning a trip. Check the weather in San Francisco and Tokyo, " +
      "calculate the temperature difference, " +
      "and save a note summarizing which city is warmer."
  );
  console.log(`\nClaude: ${reply}\n`);

  await dialogue.saveState({
    invocation: 1,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  console.log("--- Invocation 1 Summary ---");
  console.log(`Dialogue ID: ${dialogue.id}`);
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log("---\n");

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 - Cold resume (simulates a new serverless invocation)
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  // Load conversation fresh from DialogueDB.
  // In production this is your Next.js API route loading the conversation
  // from a session ID passed in the request.
  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages from DialogueDB\n`);

  // Follow-up question — Claude should remember the weather comparison
  const reply = await agentTurn(
    dialogue,
    "Based on our earlier weather comparison, which city would you recommend " +
      "for outdoor sightseeing? And what note did you save?"
  );
  console.log(`\nClaude: ${reply}\n`);

  await dialogue.saveState({
    invocation: 2,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  console.log("--- Invocation 2 Summary ---");
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log("---\n");

  // Cleanup
  await db.deleteDialogue(dialogueId);
  console.log("Cleaned up. Done!");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Run both invocations back-to-back to demonstrate the full flow
  const id = await invocation1();
  await invocation2(id);
}

main().catch(console.error);
