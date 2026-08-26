import "dotenv/config";
import OpenAI from "openai";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

import { toChatMessages, loadDialogue } from "./persist";

/**
 * DialogueDB + xAI (Grok): persistent chat, end to end.
 *
 * xAI's API is stateless: every call takes the full message history. This runs
 * a chat turn, reloads the conversation cold from DialogueDB (as a fresh
 * process would), and continues it — proving the history survives a restart.
 *
 * xAI has no official JS SDK; its documented JS path is the OpenAI SDK pointed
 * at https://api.x.ai/v1, which is what this example does.
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.XAI_API_KEY) {
  throw new Error(
    "Missing XAI_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const NAMESPACE = "user_demo";
// Override with XAI_MODEL if this id is unavailable to your key; list yours
// with GET https://api.x.ai/v1/language-models.
const MODEL = process.env.XAI_MODEL ?? "grok-4.20-0309-non-reasoning";

/** One chat turn: persist the user message, run Grok, persist the reply. */
async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const response = await xai.chat.completions.create({
    model: MODEL,
    max_tokens: 256,
    messages: toChatMessages(dialogue),
  });
  const reply = response.choices[0].message.content ?? "";

  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

async function main(): Promise<void> {
  const dialogueId = `xai-demo-${Date.now()}`;
  console.log(`Dialogue: ${dialogueId} (namespace: ${NAMESPACE})\n`);

  const dialogue = await db.getOrCreateDialogue({
    id: dialogueId,
    namespace: NAMESPACE,
  });

  console.log("Turn 1:");
  const reply1 = await runTurn(
    dialogue,
    "In one word, what does DialogueDB store?",
  );
  console.log(`  user: In one word, what does DialogueDB store?`);
  console.log(`  grok: ${reply1}\n`);

  // Cold reload, as a fresh process would do. Nothing is reused from above.
  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  if (!reloaded) throw new Error("Dialogue not found after reload");
  console.log(
    `Reloaded from DialogueDB: ${reloaded.messages.length} messages\n`,
  );

  console.log("Turn 2 (continued from the reloaded history):");
  const reply2 = await runTurn(
    reloaded,
    "And in one word, why does that matter?",
  );
  console.log(`  user: And in one word, why does that matter?`);
  console.log(`  grok: ${reply2}\n`);

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log(
    "Cleaned up. The conversation round-tripped through DialogueDB across a cold reload.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
