/**
 * Advanced - function calling and cross-SDK content
 *
 * Shows the two things that make persistence non-trivial with Gemini:
 *
 * 1. A function-calling turn is a parts array (functionCall / functionResponse),
 *    so it is stored as structured content and round-trips unchanged.
 * 2. A dialogue can be written by another SDK. Content blocks stored by the
 *    Anthropic examples are not valid Gemini parts, so persist.ts normalizes
 *    them instead of letting the request fail.
 */

import {
  GoogleGenAI,
  type FunctionDeclaration,
  type Part,
} from "@google/genai";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { requireEnv } from "./env.js";
import { loadDialogue, toGeminiContents } from "./persist.js";

const MODEL = "gemini-3.5-flash-lite";
const NAMESPACE = "advanced";

const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

const getWeather: FunctionDeclaration = {
  name: "get_weather",
  description: "Get the current temperature for a city",
  parametersJsonSchema: {
    type: "object",
    properties: { city: { type: "string", description: "City name" } },
    required: ["city"],
  },
};

/** Stand-in for a real weather service. */
function lookupWeather(city: string): string {
  return `18C and overcast in ${city}`;
}

async function functionCallingTurn(
  dialogueId: string,
  input: string,
): Promise<void> {
  const dialogue = await loadDialogue(db, dialogueId, NAMESPACE);
  await dialogue.saveMessage({ role: "user", content: input });

  const first = await ai.models.generateContent({
    model: MODEL,
    contents: toGeminiContents(dialogue),
    config: {
      tools: [{ functionDeclarations: [getWeather] }],
      maxOutputTokens: 200,
    },
  });

  const calls = first.functionCalls ?? [];
  if (calls.length === 0) {
    const reply = first.text ?? "";
    await dialogue.saveMessage({ role: "assistant", content: reply });
    console.log(`Gemini answered without calling a tool: ${reply.trim()}`);
    return;
  }

  // The model's turn is its parts array. Store it as structured content so the
  // functionCall survives verbatim for the next request.
  const modelParts = first.candidates?.[0]?.content?.parts ?? [];
  if (modelParts.length === 0) {
    // Storing an empty turn here would leave the functionResponse below with no
    // functionCall to answer, which Gemini rejects on the next request.
    throw new Error(
      "The model asked for tool calls but returned no parts to store.",
    );
  }
  await dialogue.saveMessage({
    role: "assistant",
    content: modelParts,
    metadata: { hasFunctionCalls: true },
  });

  const responseParts: Part[] = calls.map((call) => ({
    functionResponse: {
      name: call.name ?? getWeather.name,
      response: { result: lookupWeather(String(call.args?.city ?? "unknown")) },
    },
  }));
  await dialogue.saveMessage({ role: "user", content: responseParts });
  console.log(`Tool called: ${calls.map((c) => c.name).join(", ")}`);

  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  const final = await ai.models.generateContent({
    model: MODEL,
    contents: toGeminiContents(reloaded),
    config: {
      tools: [{ functionDeclarations: [getWeather] }],
      maxOutputTokens: 200,
    },
  });
  const answer = final.text ?? "";
  await reloaded.saveMessage({ role: "assistant", content: answer });
  console.log(`Gemini: ${answer.trim()}`);
}

/** A turn stored by a different SDK still has to be readable here. */
async function crossSdkTurn(dialogueId: string): Promise<void> {
  const dialogue = await loadDialogue(db, dialogueId, NAMESPACE);

  // Exactly what the Anthropic examples persist: an array of content blocks.
  await dialogue.saveMessage({
    role: "assistant",
    content: [
      { type: "text", text: "I checked the deploy log earlier." },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "read_log",
        input: { path: "/var/log/deploy" },
      },
    ],
  });
  await dialogue.saveMessage({
    role: "user",
    content: "In one sentence, what did you check?",
  });

  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: toGeminiContents(reloaded),
    config: { maxOutputTokens: 120 },
  });
  const answer = response.text ?? "";
  await reloaded.saveMessage({ role: "assistant", content: answer });
  console.log(`Gemini read the foreign blocks: ${answer.trim()}`);
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Gemini: Advanced ===\n");

  const toolDialogueId = `gemini-tools-${Date.now()}`;
  console.log("-- function calling --");
  await functionCallingTurn(toolDialogueId, "What's the weather in Lisbon?");
  await db.deleteDialogue(toolDialogueId, { namespace: NAMESPACE });

  const crossDialogueId = `gemini-cross-sdk-${Date.now()}`;
  console.log("\n-- content written by another SDK --");
  await crossSdkTurn(crossDialogueId);
  await db.deleteDialogue(crossDialogueId, { namespace: NAMESPACE });

  console.log("\nCleaned up both demo dialogues.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
