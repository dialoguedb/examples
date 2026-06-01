/**
 * DialogueDB + llm-exe: Persistent Chatbot
 *
 * Each user message runs through an llm-exe executor pipeline:
 *   prompt template (with conversation history) → LLM → JSON parser
 *
 * The JSON parser extracts both the response AND structured metadata
 * (intent, sentiment) in a single LLM call. DialogueDB persists every
 * message with that metadata, so on cold restart the bot has full
 * conversation context and structured analytics from past interactions.
 *
 * Usage:
 *   npm run chatbot        # Both invocations back-to-back
 *   npm run chatbot:1      # Invocation 1 only (prints dialogue ID)
 *   npm run chatbot:2      # Invocation 2 only (needs DIALOGUE_ID env)
 */

import {
  useLlm,
  createChatPrompt,
  createParser,
  createLlmExecutor,
  defineSchema,
} from "llm-exe";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const llm = useLlm("openai.gpt-4o-mini");
const db = new DialogueDB();

// ---------------------------------------------------------------------------
// Structured response schema — llm-exe extracts this from every LLM reply
// ---------------------------------------------------------------------------

const responseSchema = defineSchema({
  type: "object",
  properties: {
    response: { type: "string" },
    intent: { type: "string" },
    sentiment: { type: "string" },
  },
  required: ["response", "intent", "sentiment"],
} as const);

const SYSTEM_PROMPT = `You are a helpful travel planning assistant. Be concise and helpful.

Always respond with valid JSON in this exact format:
{
  "response": "your conversational reply",
  "intent": "question | planning | feedback | general",
  "sentiment": "positive | neutral | negative"
}

Respond ONLY with the JSON object.`;

// ---------------------------------------------------------------------------
// Chat turn — llm-exe executor + DialogueDB persistence
// ---------------------------------------------------------------------------

async function chatTurn(dialogue: Dialogue, userMessage: string) {
  // Build a prompt that includes full conversation history from DialogueDB
  const prompt = createChatPrompt<{ input: string }>(SYSTEM_PROMPT);

  for (const msg of dialogue.messages) {
    if (typeof msg.content !== "string") continue;
    if (msg.role === "user") {
      prompt.addUserMessage(msg.content);
    } else if (msg.role === "assistant") {
      prompt.addAssistantMessage(msg.content);
    }
  }

  prompt.addUserMessage("{{input}}");

  // llm-exe pipeline: prompt → LLM → JSON parser with typed schema
  const parser = createParser("json", { schema: responseSchema });
  const executor = createLlmExecutor({ llm, prompt, parser });
  const result = await executor.execute({ input: userMessage });

  // Persist both messages to DialogueDB (metadata enables structured queries)
  await dialogue.saveMessage({ role: "user", content: userMessage });
  await dialogue.saveMessage({
    role: "assistant",
    content: result.response,
    metadata: { intent: result.intent, sentiment: result.sentiment },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Invocation 1 — multi-turn conversation
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Travel Planning Chat ===\n");

  const dialogue = await db.createDialogue({
    label: "llm-exe-chatbot-demo",
    state: { provider: "openai", model: "gpt-4o-mini", framework: "llm-exe" },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  const questions = [
    "I'm planning a 10-day trip to Japan in October. What regions should I focus on?",
    "Great! What about the food scene in Kyoto specifically? I'm vegetarian.",
    "Can you suggest a 3-day Kyoto itinerary with those food spots included?",
  ];

  for (const question of questions) {
    console.log(`You: ${question}`);
    const result = await chatTurn(dialogue, question);
    console.log(`Bot: ${result.response}`);
    console.log(`     [intent: ${result.intent} | sentiment: ${result.sentiment}]\n`);
  }

  await dialogue.saveState({
    provider: "openai",
    model: "gpt-4o-mini",
    framework: "llm-exe",
    totalMessages: dialogue.messages.length,
  });

  console.log(
    `--- Invocation 1 complete: ${dialogue.messages.length} messages persisted ---\n`
  );
  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 — cold resume from DialogueDB
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string): Promise<void> {
  console.log("=== Invocation 2: Cold Resume ===\n");

  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages from DialogueDB\n`);

  const followUp =
    "Quick recap: what trip am I planning, what dietary restriction did I mention, and what city itinerary did we work on?";

  console.log(`You: ${followUp}`);
  const result = await chatTurn(dialogue, followUp);
  console.log(`Bot: ${result.response}`);
  console.log(`     [intent: ${result.intent} | sentiment: ${result.sentiment}]\n`);

  const lower = result.response.toLowerCase();
  const remembered =
    lower.includes("japan") &&
    (lower.includes("vegetarian") || lower.includes("diet")) &&
    lower.includes("kyoto");

  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);
  console.log(`Total messages: ${dialogue.messages.length}\n`);

  await db.deleteDialogue(dialogueId);
  console.log("Cleaned up. Done!");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--invocation="));
  const invocation = flag ? parseInt(flag.split("=")[1]) : 0;

  if (invocation === 1) {
    const id = await invocation1();
    console.log(`\nTo resume:\n  DIALOGUE_ID=${id} npm run chatbot:2`);
  } else if (invocation === 2) {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId) {
      throw new Error("DIALOGUE_ID env var required for invocation 2");
    }
    await invocation2(dialogueId);
  } else {
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
