import "dotenv/config";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

import { toChatMessages, loadDialogue } from "./persist.js";

/**
 * DialogueDB + Cerebras: persistent chat with the fastest inference.
 *
 * Cerebras delivers the fastest AI inference available. Like most LLM APIs, it
 * is stateless — every call takes the full message history. DialogueDB is where
 * that history lives between calls, so a conversation survives a cold restart,
 * a deploy, or a new process.
 *
 * The demo runs a chat turn, reloads the conversation cold from DialogueDB
 * (as a fresh process would), and continues — proving history survives.
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.CEREBRAS_API_KEY) {
  throw new Error(
    "Missing CEREBRAS_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
  warmTCPConnection: false,
});

const NAMESPACE = "user_demo";
const MODEL = process.env.CEREBRAS_MODEL ?? "gpt-oss-120b";

async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const response = await cerebras.chat.completions.create({
    model: MODEL,
    max_tokens: 256,
    messages: toChatMessages(dialogue),
  });

  if ("error" in response) {
    throw new Error(response.error.message ?? "Cerebras API error");
  }
  if (response.object !== "chat.completion") {
    throw new Error(`Unexpected response type: ${response.object}`);
  }
  const reply = response.choices[0].message.content ?? "";

  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

async function main(): Promise<void> {
  const dialogueId = `cerebras-demo-${Date.now()}`;
  console.log(`Dialogue: ${dialogueId} (namespace: ${NAMESPACE})\n`);

  const dialogue = await db.getOrCreateDialogue({
    id: dialogueId,
    namespace: NAMESPACE,
  });

  console.log("Turn 1:");
  const reply1 = await runTurn(
    dialogue,
    "In one sentence, what makes Cerebras inference fast?",
  );
  console.log(`  user: In one sentence, what makes Cerebras inference fast?`);
  console.log(`  cerebras: ${reply1}\n`);

  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  if (!reloaded) throw new Error("Dialogue not found after reload");
  console.log(
    `Reloaded from DialogueDB: ${reloaded.messages.length} messages\n`,
  );

  console.log("Turn 2 (continued from the reloaded history):");
  const reply2 = await runTurn(
    reloaded,
    "Summarize our conversation so far in one sentence.",
  );
  console.log(`  user: Summarize our conversation so far in one sentence.`);
  console.log(`  cerebras: ${reply2}\n`);

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log(
    "Cleaned up. The conversation round-tripped through DialogueDB across a cold reload.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
