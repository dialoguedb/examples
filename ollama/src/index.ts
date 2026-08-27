import "dotenv/config";
import { Ollama } from "ollama";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

import { toChatMessages, loadDialogue } from "./persist.js";

/**
 * DialogueDB + Ollama: persistent chat with local LLMs.
 *
 * Ollama's chat API is stateless — every call needs the full history. This demo
 * runs a chat turn against a local model, reloads the conversation cold from
 * DialogueDB (as a new process would), and continues it, proving the history
 * survives a restart with zero cloud dependencies beyond DialogueDB.
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const ollama = new Ollama({ host: process.env.OLLAMA_HOST });

const NAMESPACE = "user_demo";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const response = await ollama.chat({
    model: MODEL,
    messages: toChatMessages(dialogue),
  });
  const reply = response.message.content;

  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

async function main(): Promise<void> {
  const dialogueId = `ollama-demo-${Date.now()}`;
  console.log(`Dialogue: ${dialogueId} (namespace: ${NAMESPACE})\n`);

  const dialogue = await db.getOrCreateDialogue({
    id: dialogueId,
    namespace: NAMESPACE,
  });

  console.log("Turn 1:");
  const reply1 = await runTurn(
    dialogue,
    "In one sentence, what is the capital of Japan and why is it significant?",
  );
  console.log(
    `  user: In one sentence, what is the capital of Japan and why is it significant?`,
  );
  console.log(`  ${MODEL}: ${reply1}\n`);

  // Cold reload — nothing from the original dialogue object is reused.
  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  if (!reloaded) throw new Error("Dialogue not found after reload");
  console.log(
    `Reloaded from DialogueDB: ${reloaded.messages.length} messages\n`,
  );

  console.log("Turn 2 (continued from the reloaded history):");
  const reply2 = await runTurn(
    reloaded,
    "Based on what you just told me, what's one must-see landmark there?",
  );
  console.log(
    `  user: Based on what you just told me, what's one must-see landmark there?`,
  );
  console.log(`  ${MODEL}: ${reply2}\n`);

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log(
    "Cleaned up. The conversation round-tripped through DialogueDB across a cold reload.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
