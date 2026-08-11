/**
 * Advanced Example - DialogueDB + Google Gemini SDK
 *
 * Demonstrates the full integration:
 * - Function calling with get_weather, calculate, save_note
 * - Every message persisted to DialogueDB, including function calls and results
 * - Cold resume from a separate process invocation
 * - Token usage tracking in message metadata
 *
 * Usage:
 *   npm run advanced          # Run both invocations back-to-back
 *   npm run advanced:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run advanced:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import {
  GoogleGenerativeAI,
  type Content,
  type Part,
  type GenerateContentResult,
} from "@google/generative-ai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { functionDeclarations, executeTool } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const db = new DialogueDB();
const MODEL = "gemini-2.0-flash";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gemini uses a different message format than OpenAI:
 * - Roles are "user" and "model" (not "assistant")
 * - Messages have "parts" arrays containing text, functionCall, or functionResponse
 *
 * We store the full Gemini Content object in DialogueDB's content field,
 * which accepts objects directly — no serialization needed.
 */
function toGeminiHistory(dialogue: Dialogue): Content[] {
  return dialogue.messages.map((m) => m.content as Content);
}

/** Extract text from Gemini function call result parts. */
function extractText(result: GenerateContentResult): string {
  return result.response.text();
}

/** Extract token usage from a Gemini response. */
function extractUsage(
  result: GenerateContentResult
): { promptTokens: number; candidatesTokens: number } {
  const meta = result.response.usageMetadata;
  return {
    promptTokens: meta?.promptTokenCount ?? 0,
    candidatesTokens: meta?.candidatesTokenCount ?? 0,
  };
}

/** Sum token usage from message metadata across a dialogue. */
function sumTokens(dialogue: Dialogue) {
  let input = 0;
  let output = 0;
  for (const m of dialogue.messages) {
    if (m.metadata?.promptTokens) input += Number(m.metadata.promptTokens);
    if (m.metadata?.candidatesTokens)
      output += Number(m.metadata.candidatesTokens);
  }
  return { input, output };
}

// ---------------------------------------------------------------------------
// Agent loop - runs function calls until Gemini is done
// ---------------------------------------------------------------------------

async function agentLoop(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    tools: [{ functionDeclarations }],
    systemInstruction:
      "You are a helpful assistant with access to tools. " +
      "Use them when needed to answer questions accurately. Be concise.",
  });

  // Save the user message in Gemini's Content format
  const userContent: Content = {
    role: "user",
    parts: [{ text: userMessage }],
  };
  await dialogue.saveMessage({ role: "user", content: userContent });

  // Start chat with all prior messages as history
  const history = toGeminiHistory(dialogue);
  const chat = model.startChat({ history: history.slice(0, -1) });

  // Send the initial user message
  let result = await chat.sendMessage(userMessage);
  let response = result.response;

  while (true) {
    const usage = extractUsage(result);
    const calls = response.functionCalls();

    if (calls && calls.length > 0) {
      // Save the model's function call turn
      const modelContent: Content = {
        role: "model",
        parts: response.candidates?.[0]?.content?.parts ?? [],
      };
      await dialogue.saveMessage({
        role: "assistant",
        content: modelContent,
        metadata: {
          hasFunctionCalls: true,
          promptTokens: usage.promptTokens,
          candidatesTokens: usage.candidatesTokens,
        },
      });

      // Execute each function call and build response parts
      const responseParts: Part[] = [];
      for (const call of calls) {
        console.log(
          `   [tool] ${call.name}(${JSON.stringify(call.args)})`
        );
        const toolResult = executeTool(call.name, call.args);
        console.log(`   [result] ${JSON.stringify(toolResult)}`);

        responseParts.push({
          functionResponse: {
            name: call.name,
            response: toolResult,
          },
        });
      }

      // Save function results as a user turn (Gemini's format)
      const functionResponseContent: Content = {
        role: "user",
        parts: responseParts,
      };
      await dialogue.saveMessage({
        role: "user",
        content: functionResponseContent,
        metadata: { isFunctionResponse: true },
      });

      // Send function results back to Gemini
      result = await chat.sendMessage(responseParts);
      response = result.response;
    } else {
      // No function calls — final text response
      const modelContent: Content = {
        role: "model",
        parts: [{ text: response.text() }],
      };
      await dialogue.saveMessage({
        role: "assistant",
        content: modelContent,
        metadata: {
          promptTokens: usage.promptTokens,
          candidatesTokens: usage.candidatesTokens,
        },
      });
      return extractText(result);
    }
  }
}

// ---------------------------------------------------------------------------
// Invocation 1 - Initial conversation with multi-tool use
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Multi-Tool Agent Loop ===\n");

  const dialogue = await db.createDialogue({
    label: "gemini-advanced-demo",
    state: {
      provider: "google",
      format: "gemini-chat",
      model: MODEL,
      invocation: 1,
      started: new Date().toISOString(),
    },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  console.log("Sending query that requires multiple tools...\n");
  const reply = await agentLoop(
    dialogue,
    "I'm planning a trip. Check the weather in San Francisco and Tokyo, " +
      "calculate the temperature difference in Fahrenheit, " +
      "and save a note summarizing the comparison."
  );
  console.log(`\nGemini: ${reply}\n`);

  await dialogue.saveState({
    provider: "google",
    format: "gemini-chat",
    model: MODEL,
    invocation: 1,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  const { input, output } = sumTokens(dialogue);
  console.log("--- Invocation 1 Summary ---");
  console.log(`Dialogue ID: ${dialogue.id}`);
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(`Tokens used: ${input} input, ${output} output`);
  console.log("---\n");

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 - Cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  console.log(`Loading dialogue ${dialogueId} from scratch...`);
  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages\n`);

  const followUp =
    "Based on our earlier weather comparison, which city would be better " +
    "for outdoor activities this week? Also, what note did you save?";

  console.log("Sending follow-up with full prior context...\n");
  const reply = await agentLoop(dialogue, followUp);
  console.log(`\nGemini: ${reply}\n`);

  await dialogue.saveState({
    provider: "google",
    format: "gemini-chat",
    model: MODEL,
    invocation: 2,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  const { input, output } = sumTokens(dialogue);
  console.log("--- Invocation 2 Summary ---");
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(`Tokens used: ${input} input, ${output} output`);
  console.log("---\n");

  // Cleanup
  await db.deleteDialogue(dialogueId);
  console.log("Cleaned up. Done!");
}

// ---------------------------------------------------------------------------
// Main - parse flags and run
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--invocation="));
  const invocation = flag ? parseInt(flag.split("=")[1]) : 0;

  if (invocation === 1) {
    const id = await invocation1();
    console.log(
      `\nTo run invocation 2:\n  DIALOGUE_ID=${id} npm run advanced:2`
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
