import "dotenv/config";
import { run } from "@openai/agents";
import type { AgentInputItem } from "@openai/agents";
import { DialogueDB } from "dialogue-db";

import { buildAgent, MODEL } from "./agent";
import { conversationStore } from "./persist";

/**
 * OpenAI Agents SDK + DialogueDB: an agent that remembers across sessions.
 *
 * The SDK deliberately leaves durable storage to you. This wires it explicitly:
 *
 *   1. load prior history for the user from DialogueDB
 *   2. search that user's memories and inject the matches into the instructions
 *   3. run the agent, seeding it with the loaded history
 *   4. save the items this run added
 *
 * Turn 2 runs against a cold reload, so what the agent recalls came back from
 * DialogueDB rather than from anything still in this process.
 *
 * Run it: npm start
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });

// Namespace is the user id. Every read and write below is scoped to it, so two
// users can never see each other's conversation or memory.
const USER_ID = "user_demo";
const store = conversationStore(db, USER_ID);

/** One turn: recall, run seeded with prior history, persist what was added. */
async function turn(
  dialogueId: string,
  userText: string,
): Promise<AgentInputItem[]> {
  const history = await store.loadHistory(dialogueId);

  // Caller-controlled memory: we search, we decide what to inject. Nothing is
  // extracted automatically.
  const recalled = await store.recallFacts(userText);
  if (recalled.length > 0) {
    console.log(`  (recalled: ${recalled.join(" | ")})`);
  }

  const agent = buildAgent(recalled);
  const input: AgentInputItem[] = [
    ...history,
    { type: "message", role: "user", content: userText },
  ];

  const result = await run(agent, input);

  // result.history is the full conversation for the next run. Persist only the
  // items this turn added, so we do not duplicate what is already stored.
  const added = result.history.slice(history.length);
  await store.appendItems(dialogueId, added);

  console.log(`  agent: ${result.finalOutput ?? "(no final output)"}`);
  return added;
}

function describe(items: AgentInputItem[]): string {
  return items
    .map((item) => {
      if ("type" in item && item.type === "function_call") {
        return `function_call(${item.name})`;
      }
      if ("type" in item && item.type === "function_call_result") {
        return "function_call_result";
      }
      if ("role" in item) return `${item.role} message`;
      return "type" in item && typeof item.type === "string"
        ? item.type
        : "item";
    })
    .join(", ");
}

async function main(): Promise<void> {
  const dialogueId = `agents-sdk-demo-${Date.now()}`;
  console.log(`Conversation: ${dialogueId}`);
  console.log(`Namespace:    ${USER_ID}`);
  console.log(`Model:        ${MODEL}\n`);

  // The caller decides what is worth remembering long term.
  const memoryId = "demo-lisbon-trip";
  await store.rememberFact(
    memoryId,
    "The user is planning a trip to Lisbon in October.",
  );
  console.log("Stored a memory: trip to Lisbon in October.\n");

  console.log("--- Turn 1 (tool call expected) ---");
  console.log(
    "  user: What is the weather in Lisbon, and what is 200 USD in EUR?",
  );
  const added1 = await turn(
    dialogueId,
    "What is the weather in Lisbon, and what is 200 USD in EUR?",
  );
  console.log(`  persisted this turn: ${describe(added1)}\n`);

  // Cold reload: nothing from turn 1 is reused in memory, it all comes back
  // from DialogueDB.
  const reloaded = await store.loadHistory(dialogueId);
  console.log("--- Cold reload from DialogueDB ---");
  console.log(`  ${reloaded.length} items: ${describe(reloaded)}`);
  const toolCallsSurvived = reloaded.some(
    (item) => "type" in item && item.type === "function_call",
  );
  console.log(
    `  tool calls survived the round trip: ${toolCallsSurvived ? "YES" : "NO"}\n`,
  );

  console.log("--- Turn 2 (seeded from the reloaded history) ---");
  console.log(
    "  user: Which of those two cities did I ask about, and what did you say the weather was?",
  );
  await turn(
    dialogueId,
    "Which city did I ask about, and what did you say the weather was?",
  );

  const finalHistory = await store.loadHistory(dialogueId);
  console.log(`\nStored conversation is now ${finalHistory.length} items.`);

  await store.deleteConversation(dialogueId);
  await store.forgetFact(memoryId);
  console.log("Cleaned up the demo conversation and memory.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
