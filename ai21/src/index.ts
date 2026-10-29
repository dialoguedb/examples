import "dotenv/config";
import { AI21 } from "ai21";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

import { toChatMessages, loadDialogue } from "./persist.js";

/**
 * DialogueDB + AI21 Labs (Jamba): persistent chat, end to end.
 *
 * AI21's chat API is stateless — every call takes the full message history.
 * DialogueDB is where that history lives between calls, so a conversation
 * survives a cold restart with no database to run.
 *
 * The demo runs a chat turn, reloads the conversation cold from DialogueDB,
 * and continues it, proving the history round-trips.
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.AI21_API_KEY) {
  throw new Error(
    "Missing AI21_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const ai21 = new AI21({ apiKey: process.env.AI21_API_KEY });

const NAMESPACE = "user_demo";
const MODEL = "jamba-mini";

async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const response = await ai21.chat.completions.create({
    model: MODEL,
    messages: toChatMessages(dialogue),
    max_tokens: 256,
  });
  const reply = response.choices[0].message.content ?? "";

  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

async function main(): Promise<void> {
  const dialogueId = `ai21-demo-${Date.now()}`;
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
  console.log("  user: In one word, what does DialogueDB store?");
  console.log(`  jamba: ${reply1}\n`);

  // Cold reload — nothing from above is reused.
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
  console.log("  user: And in one word, why does that matter?");
  console.log(`  jamba: ${reply2}\n`);

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log(
    "Cleaned up. The conversation round-tripped through DialogueDB across a cold reload.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
