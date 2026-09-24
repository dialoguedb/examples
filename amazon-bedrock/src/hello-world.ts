/**
 * Hello World - DialogueDB + Amazon Bedrock (Converse API)
 *
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Bedrock, saving every message
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — the model has full context from before the restart
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { requireEnv } from "./env.js";
import {
  loadDialogue,
  toBedrockMessages,
  toSystemPrompt,
} from "./persist.js";

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-sonnet-4-20250514-v1:0";
const NAMESPACE = "hello-world";

const bedrock = new BedrockRuntimeClient();
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

async function runTurn(
  client: DialogueDB,
  dialogueId: string,
  input: string,
): Promise<string> {
  const dialogue = await loadDialogue(client, dialogueId, NAMESPACE);
  await dialogue.saveMessage({ role: "user", content: input });

  const response = await bedrock.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: toSystemPrompt(dialogue),
      messages: toBedrockMessages(dialogue),
      inferenceConfig: { maxTokens: 200 },
    }),
  );

  const content = response.output?.message?.content;
  if (!content) throw new Error("No response from Bedrock");

  const reply = content
    .map((block) => block.text)
    .filter((text): text is string => text !== undefined)
    .join("");

  await dialogue.saveMessage({
    role: "assistant",
    content: reply,
    metadata: {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
    },
  });
  return reply;
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Amazon Bedrock: Hello World ===\n");

  const dialogueId = `bedrock-hello-${Date.now()}`;

  const created = await loadDialogue(db, dialogueId, NAMESPACE);
  await created.saveMessage({
    role: "system",
    content: "Answer in one short sentence.",
  });
  console.log(`Created dialogue: ${created.id}\n`);

  const first = await runTurn(
    db,
    dialogueId,
    "I'm deploying to us-west-2 tonight. Acknowledge briefly.",
  );
  console.log(
    `User: I'm deploying to us-west-2 tonight.\nBedrock: ${first.trim()}\n`,
  );

  console.log("--- simulating a cold restart ---\n");
  const cold = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const resumed = await loadDialogue(cold, dialogueId, NAMESPACE);
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  const second = await runTurn(cold, dialogueId, "Which region did I say?");
  console.log(`User: Which region did I say?\nBedrock: ${second.trim()}\n`);

  const remembered = second.toLowerCase().includes("us-west-2");
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
