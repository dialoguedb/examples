/**
 * Hello World - DialogueDB + xAI (Grok)
 *
 * Grok speaks the OpenAI chat-completions protocol, so the official `openai`
 * client works against api.x.ai with a different baseURL. The API is stateless:
 * every call takes the whole message array. These examples keep that array in
 * DialogueDB so the conversation survives a restart.
 */

import OpenAI from "openai";
import { DialogueDB, type Dialogue } from "dialogue-db";
import "dotenv/config";
import { loadDialogue, toChatMessages } from "./persist.js";

const MODEL = "grok-4.20-0309-non-reasoning";
const NAMESPACE = "hello-world";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const xai = new OpenAI({
  apiKey: requireEnv("XAI_API_KEY"),
  baseURL: "https://api.x.ai/v1",
});
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

/** One turn: persist the user message, run Grok, persist the reply. */
async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const response = await xai.chat.completions.create({
    model: MODEL,
    max_tokens: 200,
    messages: toChatMessages(dialogue),
  });

  const reply = response.choices[0]?.message.content ?? "";
  await dialogue.saveMessage({
    role: "assistant",
    content: reply,
    metadata: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    },
  });
  return reply;
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Grok: Hello World ===\n");

  const dialogueId = `xai-hello-${Date.now()}`;
  const dialogue = await loadDialogue(db, dialogueId, NAMESPACE);
  await dialogue.saveMessage({ role: "system", content: "Answer in one short sentence." });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  const first = await runTurn(dialogue, "My rollback tag is v3.9.1. Acknowledge briefly.");
  console.log(`User: My rollback tag is v3.9.1.\nGrok: ${first.trim()}\n`);

  // A fresh process starts here, holding nothing.
  console.log("--- simulating a cold restart ---\n");
  const cold = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const reloaded = await loadDialogue(cold, dialogueId, NAMESPACE);
  console.log(`Loaded ${reloaded.messages.length} messages from DialogueDB\n`);

  const second = await runTurn(reloaded, "What was my rollback tag?");
  console.log(`User: What was my rollback tag?\nGrok: ${second.trim()}\n`);

  console.log(second.includes("v3.9.1") ? "Context survived the restart." : "Context was lost.");

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log("Cleaned up the demo dialogue.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
