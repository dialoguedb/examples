import "dotenv/config";
import Replicate from "replicate";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

import { buildPrompt, collectOutput, loadDialogue } from "./persist.js";

/**
 * DialogueDB + Replicate: persistent chat with open-source models.
 *
 * Replicate runs open-source models (Llama, Mistral, etc.) on cloud GPUs.
 * Its API is prompt-based, not message-based — each call takes a prompt string,
 * not a messages array. This example shows how DialogueDB bridges that gap:
 * structured messages are stored in DialogueDB and converted to prompts for
 * each Replicate call.
 *
 * The flow: chat turn, cold reload from DialogueDB, continue — proving the
 * conversation history survives a restart.
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error(
    "Missing REPLICATE_API_TOKEN. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const replicate = new Replicate();

const NAMESPACE = "user_demo";

async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const { systemPrompt, prompt } = buildPrompt(dialogue);
  const output = await replicate.run("meta/meta-llama-3.1-8b-instruct", {
    input: {
      prompt,
      system_prompt: systemPrompt,
      max_new_tokens: 256,
    },
  });

  const reply = collectOutput(output).trim();
  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

async function main(): Promise<void> {
  const dialogueId = `replicate-demo-${Date.now()}`;
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
  console.log("  user:  In one word, what does DialogueDB store?");
  console.log(`  llama: ${reply1}\n`);

  // Cold reload — nothing from the original dialogue object is reused.
  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  if (!reloaded) throw new Error("Dialogue not found after reload");
  console.log(
    `Reloaded from DialogueDB: ${reloaded.messages.length} messages\n`,
  );

  console.log("Turn 2 (continued from reloaded history):");
  const reply2 = await runTurn(
    reloaded,
    "And in one word, why does that matter?",
  );
  console.log("  user:  And in one word, why does that matter?");
  console.log(`  llama: ${reply2}\n`);

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log(
    "Cleaned up. The conversation round-tripped through DialogueDB across a cold reload.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
