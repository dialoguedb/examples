/**
 * Hello World — DialogueDB + Azure AI Inference
 *
 * 1. Create a conversation in DialogueDB
 * 2. Chat with an Azure-hosted model, saving every message
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — the model has full context from before the restart
 */

import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { requireEnv } from "./env.js";
import { loadDialogue, toChatMessages } from "./persist.js";

const MODEL = process.env.AZURE_AI_MODEL ?? "gpt-4o-mini";
const NAMESPACE = "hello-world";

const client = ModelClient(
  requireEnv("AZURE_AI_ENDPOINT"),
  new AzureKeyCredential(requireEnv("AZURE_AI_API_KEY")),
);

const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

async function runTurn(
  dbClient: DialogueDB,
  dialogueId: string,
  input: string,
): Promise<string> {
  const dialogue = await loadDialogue(dbClient, dialogueId, NAMESPACE);
  await dialogue.saveMessage({ role: "user", content: input });

  const response = await client.path("/chat/completions").post({
    body: {
      messages: toChatMessages(dialogue),
      model: MODEL,
      max_tokens: 200,
    },
  });

  if (isUnexpected(response)) {
    throw new Error(
      `Azure AI request failed: ${response.body.error.message}`,
    );
  }

  const reply = response.body.choices[0].message.content ?? "";
  const usage = response.body.usage;

  await dialogue.saveMessage({
    role: "assistant",
    content: reply,
    metadata: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
    },
  });

  return reply;
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Azure AI Inference: Hello World ===\n");

  const dialogueId = `azure-hello-${Date.now()}`;

  const created = await loadDialogue(db, dialogueId, NAMESPACE);
  await created.saveMessage({
    role: "system",
    content: "Answer in one short sentence.",
  });
  console.log(`Created dialogue: ${created.id}\n`);

  const first = await runTurn(
    db,
    dialogueId,
    "I'm migrating our API from REST to GraphQL by next Friday. Acknowledge briefly.",
  );
  console.log(
    `User: I'm migrating our API from REST to GraphQL by next Friday.\nModel: ${first.trim()}\n`,
  );

  // Cold restart: a brand-new client holding nothing in memory.
  console.log("--- simulating a cold restart ---\n");
  const cold = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const resumed = await loadDialogue(cold, dialogueId, NAMESPACE);
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  const second = await runTurn(
    cold,
    dialogueId,
    "What migration did I mention, and what's the deadline?",
  );
  console.log(
    `User: What migration did I mention, and what's the deadline?\nModel: ${second.trim()}\n`,
  );

  const remembered =
    second.toLowerCase().includes("graphql") &&
    second.toLowerCase().includes("friday");
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
