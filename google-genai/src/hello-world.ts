/**
 * Hello World - DialogueDB + Google Gemini (@google/genai)
 *
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Gemini, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Gemini has full context from before the restart
 */

import { GoogleGenAI } from "@google/genai";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { loadDialogue, toGeminiContents, toSystemInstruction } from "./persist.js";

const MODEL = "gemini-3.5-flash-lite";
const NAMESPACE = "hello-world";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

/** One turn: persist the user message, run Gemini, persist the reply. */
async function runTurn(dialogueId: string, input: string): Promise<string> {
  const dialogue = await loadDialogue(db, dialogueId, NAMESPACE);
  await dialogue.saveMessage({ role: "user", content: input });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: toGeminiContents(dialogue),
    config: {
      maxOutputTokens: 200,
      systemInstruction: toSystemInstruction(dialogue),
    },
  });

  const reply = response.text ?? "";
  await dialogue.saveMessage({
    role: "assistant",
    content: reply,
    metadata: {
      promptTokenCount: response.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  });
  return reply;
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Gemini: Hello World ===\n");

  const dialogueId = `gemini-hello-${Date.now()}`;

  // A system message is stored like any other, and reaches Gemini as a
  // systemInstruction rather than as a conversational turn.
  const created = await loadDialogue(db, dialogueId, NAMESPACE);
  await created.saveMessage({ role: "system", content: "Answer in one short sentence." });
  console.log(`Created dialogue: ${created.id}\n`);

  const first = await runTurn(dialogueId, "I'm deploying to eu-west-2 tonight. Acknowledge briefly.");
  console.log(`User: I'm deploying to eu-west-2 tonight.\nGemini: ${first.trim()}\n`);

  // Cold restart: a brand new client holding nothing in memory.
  console.log("--- simulating a cold restart ---\n");
  const cold = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const resumed = await loadDialogue(cold, dialogueId, NAMESPACE);
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  const second = await runTurn(dialogueId, "Which region did I say?");
  console.log(`User: Which region did I say?\nGemini: ${second.trim()}\n`);

  const remembered = second.toLowerCase().includes("eu-west-2");
  console.log(remembered ? "Context survived the restart." : "Context was lost.");

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log("Cleaned up the demo dialogue.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
