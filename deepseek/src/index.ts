import "dotenv/config";
import OpenAI from "openai";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

import { toChatMessages, loadDialogue } from "./persist.js";

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error(
    "Missing DEEPSEEK_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const NAMESPACE = "user_demo";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const response = await deepseek.chat.completions.create({
    model: MODEL,
    max_tokens: 256,
    messages: toChatMessages(dialogue),
  });
  const reply = response.choices[0].message.content ?? "";

  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

async function main(): Promise<void> {
  const dialogueId = `deepseek-demo-${Date.now()}`;
  console.log(`Dialogue: ${dialogueId} (namespace: ${NAMESPACE})\n`);

  const dialogue = await db.getOrCreateDialogue({
    id: dialogueId,
    namespace: NAMESPACE,
  });

  console.log("Turn 1:");
  const reply1 = await runTurn(
    dialogue,
    "In one sentence, what is DialogueDB?",
  );
  console.log(`  user: In one sentence, what is DialogueDB?`);
  console.log(`  deepseek: ${reply1}\n`);

  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  if (!reloaded) throw new Error("Dialogue not found after reload");
  console.log(
    `Reloaded from DialogueDB: ${reloaded.messages.length} messages\n`,
  );

  console.log("Turn 2 (continued from the reloaded history):");
  const reply2 = await runTurn(
    reloaded,
    "Why would a developer choose it over a regular database?",
  );
  console.log(`  user: Why would a developer choose it over a regular database?`);
  console.log(`  deepseek: ${reply2}\n`);

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log(
    "Cleaned up. The conversation round-tripped through DialogueDB across a cold reload.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
