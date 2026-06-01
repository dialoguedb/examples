/**
 * DialogueDB + llm-exe Pipeline: Intent-Routed Support Agent
 *
 * Chains two llm-exe executors per message:
 *   1. Classifier — extracts intent, urgency, entities (JSON parser + defineSchema)
 *   2. Specialist — generates a response using an intent-specific prompt (string parser)
 *
 * DialogueDB persists every message with classification metadata, so on cold
 * restart the specialist has full context and every routing decision is auditable.
 *
 * Usage:
 *   npm run pipeline          # Both invocations back-to-back
 *   npm run pipeline:1        # Invocation 1 only (prints dialogue ID)
 *   npm run pipeline:2        # Invocation 2 only (needs DIALOGUE_ID env)
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
// Stage 1: Intent classifier — structured JSON via defineSchema
// ---------------------------------------------------------------------------

const classificationSchema = defineSchema({
  type: "object",
  properties: {
    intent: { type: "string" },
    urgency: { type: "string" },
    entities: { type: "array", items: { type: "string" } },
  },
  required: ["intent", "urgency", "entities"],
} as const);

const CLASSIFIER_SYSTEM = `Classify the user message. Respond ONLY with valid JSON.
Intent: billing | technical | account | general
Urgency: low | medium | high
Entities: extract product names, error codes, order IDs, or key references.

{"intent": "...", "urgency": "...", "entities": ["..."]}`;

// ---------------------------------------------------------------------------
// Stage 2: Specialist responders — routed by classified intent
// ---------------------------------------------------------------------------

const specialists: Record<string, string> = {
  billing:
    "You are a billing specialist. Help with invoices, payments, and subscriptions. Be precise about amounts and dates. Be concise.",
  technical:
    "You are a technical support engineer. Debug issues, explain errors, and guide solutions. Be specific and actionable. Be concise.",
  account:
    "You are an account manager. Help with settings, access, and security. Be security-conscious. Be concise.",
  general:
    "You are a helpful support agent. Answer clearly and concisely.",
};

// ---------------------------------------------------------------------------
// Pipeline: classify → route → respond → persist
// ---------------------------------------------------------------------------

async function runPipeline(dialogue: Dialogue, userMessage: string) {
  // Stage 1: classify intent, urgency, and entities
  const classifierPrompt = createChatPrompt<{ input: string }>(
    CLASSIFIER_SYSTEM
  ).addUserMessage("{{input}}");

  const classifierExecutor = createLlmExecutor({
    llm,
    prompt: classifierPrompt,
    parser: createParser("json", { schema: classificationSchema }),
  });

  const classification = await classifierExecutor.execute({ input: userMessage });
  console.log(
    `  → [${classification.intent} | ${classification.urgency}] entities: ${classification.entities.join(", ") || "none"}`
  );

  // Stage 2: route to specialist based on classified intent
  const systemPrompt = specialists[classification.intent] ?? specialists.general;
  const responsePrompt = createChatPrompt<{ input: string }>(systemPrompt);

  for (const msg of dialogue.messages) {
    if (typeof msg.content !== "string") continue;
    if (msg.role === "user") responsePrompt.addUserMessage(msg.content);
    else if (msg.role === "assistant") responsePrompt.addAssistantMessage(msg.content);
  }
  responsePrompt.addUserMessage("{{input}}");

  const responder = createLlmExecutor({
    llm,
    prompt: responsePrompt,
    parser: createParser("string"),
  });

  const response = await responder.execute({ input: userMessage });

  // Persist both messages with classification metadata
  await dialogue.saveMessage({
    role: "user",
    content: userMessage,
    metadata: {
      intent: classification.intent,
      urgency: classification.urgency,
      entities: classification.entities.join(", "),
    },
  });
  await dialogue.saveMessage({
    role: "assistant",
    content: response,
    metadata: { specialist: classification.intent },
  });

  return { response, classification };
}

// ---------------------------------------------------------------------------
// Invocation 1 — multi-turn support conversation that escalates
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Support Pipeline ===\n");

  const dialogue = await db.createDialogue({
    label: "llm-exe-pipeline-demo",
    state: { provider: "openai", model: "gpt-4o-mini", framework: "llm-exe" },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  const messages = [
    "Hi, I upgraded to Pro but my dashboard still shows the Free plan. Is there a delay?",
    "I checked my credit card and the charge went through yesterday. Order ID is ORD-4821.",
    "This is blocking my team — we need the higher rate limits for a client demo tomorrow.",
  ];

  for (const msg of messages) {
    console.log(`You: ${msg}`);
    const { response } = await runPipeline(dialogue, msg);
    console.log(`Bot: ${response}\n`);
  }

  await dialogue.saveState({
    provider: "openai",
    model: "gpt-4o-mini",
    framework: "llm-exe",
    pattern: "classify-route-respond",
    totalMessages: dialogue.messages.length,
  });

  console.log(
    `--- Invocation 1 complete: ${dialogue.messages.length} messages persisted ---\n`
  );
  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 — cold resume with full pipeline context
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string): Promise<void> {
  console.log("=== Invocation 2: Cold Resume ===\n");

  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages from DialogueDB\n`);

  const followUp =
    "Quick recap: what issue am I having, what order ID did I give you, and why is this urgent?";

  console.log(`You: ${followUp}`);
  const { response } = await runPipeline(dialogue, followUp);
  console.log(`Bot: ${response}\n`);

  const lower = response.toLowerCase();
  const remembered =
    lower.includes("pro") &&
    (lower.includes("ord-4821") || lower.includes("4821")) &&
    (lower.includes("demo") ||
      lower.includes("tomorrow") ||
      lower.includes("urgent") ||
      lower.includes("block"));

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
    console.log(`\nTo resume:\n  DIALOGUE_ID=${id} npm run pipeline:2`);
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
