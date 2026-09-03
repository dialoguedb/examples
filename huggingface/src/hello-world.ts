/**
 * Hello World - DialogueDB + Hugging Face Inference
 *
 * 1. Create a conversation in DialogueDB
 * 2. Chat with a model on Hugging Face, saving every message
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — the model has full context from before the restart
 */

import { InferenceClient } from "@huggingface/inference";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";
import { requireEnv } from "./env.js";

const MODEL = "meta-llama/Llama-3.1-8B-Instruct";
const NAMESPACE = "hello-world";

const hf = new InferenceClient(requireEnv("HF_ACCESS_TOKEN"));
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

function toHFMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));
}

async function loadDialogue(
  client: DialogueDB,
  id: string,
): Promise<Dialogue> {
  const dialogue = await client.getOrCreateDialogue({ id, namespace: NAMESPACE });
  await dialogue.loadMessages({ order: "asc" });
  return dialogue;
}

async function runTurn(
  client: DialogueDB,
  dialogueId: string,
  input: string,
): Promise<string> {
  const dialogue = await loadDialogue(client, dialogueId);
  await dialogue.saveMessage({ role: "user", content: input });

  const response = await hf.chatCompletion({
    model: MODEL,
    messages: toHFMessages(dialogue),
    max_tokens: 200,
  });

  const reply = response.choices[0].message.content ?? "";
  await dialogue.saveMessage({
    role: "assistant",
    content: reply,
    metadata: {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
    },
  });
  return reply;
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Hugging Face Inference: Hello World ===\n");

  const dialogueId = `hf-hello-${Date.now()}`;

  const created = await loadDialogue(db, dialogueId);
  await created.saveMessage({
    role: "system",
    content:
      "You are a helpful assistant. Answer concisely in one or two sentences.",
  });
  console.log(`Created dialogue: ${created.id}\n`);

  const first = await runTurn(
    db,
    dialogueId,
    "I'm migrating our API from Express to Hono and deploying on Cloudflare Workers. Any tips?",
  );
  console.log(
    `User: I'm migrating our API from Express to Hono...\nAssistant: ${first.trim()}\n`,
  );

  const second = await runTurn(
    db,
    dialogueId,
    "Good point. What about the middleware — any gotchas?",
  );
  console.log(
    `User: What about the middleware?\nAssistant: ${second.trim()}\n`,
  );

  // Cold restart: a brand-new client holding nothing in memory.
  console.log("--- simulating a cold restart ---\n");
  const cold = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const resumed = await loadDialogue(cold, dialogueId);
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  const third = await runTurn(
    cold,
    dialogueId,
    "Quick recap: what framework am I migrating to, and where am I deploying?",
  );
  console.log(`User: Quick recap?\nAssistant: ${third.trim()}\n`);

  const remembered =
    third.toLowerCase().includes("hono") ||
    third.toLowerCase().includes("cloudflare");
  console.log(
    remembered ? "Context survived the restart." : "Context was lost.",
  );

  await cold.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log("Cleaned up the demo dialogue.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
