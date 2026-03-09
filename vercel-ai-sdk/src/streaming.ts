/**
 * Streaming Example - DialogueDB + Vercel AI SDK
 *
 * Demonstrates the full integration with streaming and tools:
 * - streamText with live token output to the console
 * - Tool calls (weather, calculator, notes) with automatic execution
 * - Every message persisted to DialogueDB including tool call/result details
 * - Cold resume from a separate process invocation
 * - Token usage tracking in metadata
 *
 * Usage:
 *   npm run streaming          # Run both invocations back-to-back
 *   npm run streaming:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run streaming:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import { streamText, type CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { weatherTool, calculatorTool, notesTool } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const model = anthropic("claude-sonnet-4-20250514");

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. " +
  "Use them when needed to answer questions accurately. Be concise.";

const tools = {
  get_weather: weatherTool,
  calculate: calculatorTool,
  save_note: notesTool,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert DialogueDB messages to Vercel AI SDK CoreMessage format. */
function toSdkMessages(dialogue: Dialogue): CoreMessage[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

/**
 * Stream a response from the model, printing tokens as they arrive.
 * Persists the complete exchange (user message + assistant response)
 * to DialogueDB once streaming finishes.
 *
 * The Vercel AI SDK handles the tool execution loop automatically
 * via maxSteps — each tool call and result is a "step".
 */
async function streamChat(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  const messages = toSdkMessages(dialogue);

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    tools,
    maxSteps: 5, // Allow up to 5 tool call rounds
    messages,
  });

  // Stream tokens to the console as they arrive
  process.stdout.write("Model: ");
  let fullText = "";
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
    fullText += chunk;
  }
  process.stdout.write("\n");

  // After streaming completes, await the final results
  const [steps, usage] = await Promise.all([result.steps, result.usage]);

  // Log any tool calls that happened during streaming
  for (const step of steps) {
    for (const toolCall of step.toolCalls) {
      console.log(
        `   [tool] ${toolCall.toolName}(${JSON.stringify(toolCall.args)})`
      );
    }
    for (const toolResult of step.toolResults) {
      console.log(`   [result] ${JSON.stringify(toolResult.result)}`);
    }
  }

  // Persist the assistant response with usage metadata and tool call details
  const toolCalls = steps.flatMap((s) =>
    s.toolCalls.map((tc) => ({
      name: tc.toolName,
      args: tc.args,
    }))
  );
  const toolResults = steps.flatMap((s) =>
    s.toolResults.map((tr) => ({
      name: tr.toolName,
      result: tr.result,
    }))
  );

  await dialogue.saveMessage({
    role: "assistant",
    content: fullText,
    metadata: {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      steps: steps.length,
      ...(toolCalls.length > 0 && {
        toolCalls: JSON.stringify(toolCalls),
      }),
      ...(toolResults.length > 0 && {
        toolResults: JSON.stringify(toolResults),
      }),
    },
  });

  return fullText;
}

// ---------------------------------------------------------------------------
// Invocation 1 - Streaming conversation with tool use
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Streaming with Tools ===\n");

  const dialogue = await db.createDialogue({
    label: "vercel-ai-streaming-demo",
    state: { invocation: 1, started: new Date().toISOString() },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // This query should trigger multiple tool calls
  console.log("Sending query that requires multiple tools...\n");
  await streamChat(
    dialogue,
    "I'm planning a trip. Check the weather in San Francisco and Tokyo, " +
      "calculate the temperature difference, " +
      "and save a note summarizing the comparison."
  );
  console.log();

  // Save state for the resume
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
// Invocation 2 - Cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  // Load conversation fresh from DialogueDB
  console.log(`Loading dialogue ${dialogueId} from scratch...`);
  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages\n`);

  // Follow-up that references the previous conversation
  await streamChat(
    dialogue,
    "Based on our earlier weather comparison, which city would be better " +
      "for outdoor activities this week? Also, what note did you save?"
  );
  console.log();

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
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--invocation="));
  const invocation = flag ? parseInt(flag.split("=")[1]) : 0;

  if (invocation === 1) {
    const id = await invocation1();
    console.log(
      `\nTo run invocation 2:\n  DIALOGUE_ID=${id} npm run streaming:2`
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
