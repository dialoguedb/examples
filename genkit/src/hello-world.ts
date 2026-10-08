/**
 * Hello World - DialogueDB + Genkit
 *
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Gemini via Genkit, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - the model has full context from before the restart
 */

import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { requireEnv } from "./env.js";
import { getSystemPrompt, loadDialogue, toGenkitHistory } from "./persist.js";

const NAMESPACE = "hello-world";
const MODEL = "gemini-2.0-flash";

const ai = genkit({ plugins: [googleAI()] });
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

async function runTurn(
  client: DialogueDB,
  dialogueId: string,
  input: string,
): Promise<string> {
  const dialogue = await loadDialogue(client, dialogueId, NAMESPACE);

  await dialogue.saveMessage({ role: "user", content: input });

  // Genkit separates history (previous turns) from the current prompt.
  // All messages except the last user message form the history.
  const allHistory = toGenkitHistory(dialogue);
  const history = allHistory.slice(0, -1);
  const system = getSystemPrompt(dialogue);

  const response = await ai.generate({
    model: googleAI.model(MODEL),
    system,
    messages: history,
    prompt: input,
    config: { maxOutputTokens: 200 },
  });

  await dialogue.saveMessage({
    role: "assistant",
    content: response.text,
    metadata: {
      inputTokens: response.usage.inputTokens ?? 0,
      outputTokens: response.usage.outputTokens ?? 0,
    },
  });

  return response.text;
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Genkit: Hello World ===\n");

  const dialogueId = `genkit-hello-${Date.now()}`;

  const created = await loadDialogue(db, dialogueId, NAMESPACE);
  await created.saveMessage({
    role: "system",
    content: "Answer in one short sentence.",
  });
  console.log(`Created dialogue: ${created.id}\n`);

  const first = await runTurn(
    db,
    dialogueId,
    "I'm migrating our database from Postgres to CockroachDB next Tuesday. Acknowledge briefly.",
  );
  console.log(
    `User: I'm migrating from Postgres to CockroachDB next Tuesday.\nGenkit: ${first.trim()}\n`,
  );

  // Cold restart: a brand new client holding nothing in memory.
  console.log("--- simulating a cold restart ---\n");
  const cold = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const resumed = await loadDialogue(cold, dialogueId, NAMESPACE);
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  const second = await runTurn(
    cold,
    dialogueId,
    "Which database am I migrating to, and when?",
  );
  console.log(
    `User: Which database am I migrating to, and when?\nGenkit: ${second.trim()}\n`,
  );

  const remembered =
    second.toLowerCase().includes("cockroachdb") &&
    second.toLowerCase().includes("tuesday");
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
