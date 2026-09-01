import "dotenv/config";
import Together from "together-ai";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

import { toChatMessages, loadDialogue } from "./persist.js";

/**
 * DialogueDB + Together AI: persistent chat with open-source models.
 *
 * Together AI hosts open-source models (Llama, Mixtral, Qwen, …) behind a
 * simple chat completions API. Like every chat API, it's stateless — every
 * call needs the full history. This demo runs a chat turn, reloads the
 * conversation cold from DialogueDB, and continues it, proving the history
 * survives a restart.
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.TOGETHER_API_KEY) {
  throw new Error(
    "Missing TOGETHER_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const together = new Together();

const NAMESPACE = "user_demo";
const MODEL =
  process.env.TOGETHER_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct-Turbo";

async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const response = await together.chat.completions.create({
    model: MODEL,
    max_tokens: 256,
    messages: toChatMessages(dialogue),
  });
  const reply = response.choices[0].message?.content ?? "";

  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

async function main(): Promise<void> {
  const dialogueId = `together-demo-${Date.now()}`;
  console.log(`Dialogue: ${dialogueId} (namespace: ${NAMESPACE})\n`);

  const dialogue = await db.getOrCreateDialogue({
    id: dialogueId,
    namespace: NAMESPACE,
  });

  console.log("Turn 1:");
  const reply1 = await runTurn(
    dialogue,
    "What open-source LLM would you recommend for a coding assistant, and why? Keep it brief.",
  );
  console.log(
    `  user: What open-source LLM would you recommend for a coding assistant?`,
  );
  console.log(`  model: ${reply1.slice(0, 200)}...\n`);

  // Cold reload — nothing from the first turn is reused.
  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  if (!reloaded) throw new Error("Dialogue not found after reload");
  console.log(
    `Reloaded from DialogueDB: ${reloaded.messages.length} messages\n`,
  );

  console.log("Turn 2 (continued from the reloaded history):");
  const reply2 = await runTurn(
    reloaded,
    "What did you just recommend, and how does it compare to its predecessor?",
  );
  console.log(
    `  user: What did you just recommend, and how does it compare to its predecessor?`,
  );
  console.log(`  model: ${reply2.slice(0, 200)}...\n`);

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log(
    "Cleaned up. The conversation round-tripped through DialogueDB across a cold reload.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
