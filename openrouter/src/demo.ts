/**
 * DialogueDB + OpenRouter — Model-Agnostic Chat with Persistent History
 *
 * Uses OpenRouter to access any LLM (Claude, GPT-4, Llama, Gemini, etc.)
 * through one API, with DialogueDB storing the full conversation history.
 *
 * The key insight: your conversation storage shouldn't be coupled to your
 * model choice. Switch models freely — DialogueDB keeps the history intact.
 *
 * Run:  npm run demo
 */

import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

// OpenRouter uses the OpenAI SDK with a different base URL.
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const db = new DialogueDB();

// ---------------------------------------------------------------------------
// Chat helper
// ---------------------------------------------------------------------------

/** Send the full conversation to a model via OpenRouter, return the reply. */
async function chat(
  dialogue: Dialogue,
  model: string,
  systemPrompt?: string
): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const m of dialogue.messages) {
    messages.push({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    });
  }

  const response = await openrouter.chat.completions.create({
    model,
    messages,
    max_tokens: 512,
  });

  const reply = response.choices[0]?.message?.content;
  if (!reply) throw new Error("No response from model");
  return reply;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB + OpenRouter: Model-Agnostic Chat ===\n");

  // Pick two models to demonstrate switching mid-conversation.
  // OpenRouter gives you access to hundreds of models through one API.
  const modelA = "anthropic/claude-sonnet-4";
  const modelB = "openai/gpt-4o-mini";

  const systemPrompt =
    "You are a concise travel advisor. Keep answers under 3 sentences.";

  // DialogueDB: create a dialogue to store this conversation.
  // The system prompt is stored in dialogue state so it persists.
  const dialogue = await db.createDialogue({
    label: "openrouter-demo",
    state: { systemPrompt, models: [modelA, modelB] },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // --- Turn 1: Claude via OpenRouter ---
  console.log(`--- Using ${modelA} ---\n`);

  const userMsg1 =
    "Hi! I'm planning a 5-day trip to Japan in October. Where should I go?";
  console.log(`[user] ${userMsg1}`);

  // DialogueDB: save the user message before calling the LLM.
  await dialogue.saveMessage({ role: "user", content: userMsg1 });
  const reply1 = await chat(dialogue, modelA, systemPrompt);
  // DialogueDB: save the assistant response.
  await dialogue.saveMessage({ role: "assistant", content: reply1 });

  console.log(`[assistant] ${reply1}\n`);

  // --- Turn 2: still Claude ---
  const userMsg2 = "What about food — any must-try dishes?";
  console.log(`[user] ${userMsg2}`);

  await dialogue.saveMessage({ role: "user", content: userMsg2 });
  const reply2 = await chat(dialogue, modelA, systemPrompt);
  await dialogue.saveMessage({ role: "assistant", content: reply2 });

  console.log(`[assistant] ${reply2}\n`);

  // --- Turn 3: switch to GPT-4o-mini ---
  // The full conversation history is in DialogueDB. When we switch models,
  // the new model sees the entire conversation — no context is lost.
  console.log(`--- Switching to ${modelB} ---\n`);

  const userMsg3 =
    "Based on what we discussed, give me a rough 5-day itinerary.";
  console.log(`[user] ${userMsg3}`);

  await dialogue.saveMessage({ role: "user", content: userMsg3 });
  const reply3 = await chat(dialogue, modelB, systemPrompt);
  await dialogue.saveMessage({ role: "assistant", content: reply3 });

  console.log(`[assistant] ${reply3}\n`);

  // --- Verify: load from scratch ---
  // Simulate a fresh start. Create a new SDK instance, load the dialogue
  // by ID, and confirm all messages are there.
  console.log("--- Verifying persistence ---\n");

  const freshDb = new DialogueDB();
  const loaded = await freshDb.getDialogue(dialogue.id);
  if (!loaded) throw new Error("Dialogue not found after reload");

  await loaded.loadMessages({ order: "asc" });
  console.log(`Messages stored: ${loaded.messages.length}`);
  for (const m of loaded.messages) {
    const preview = (m.content as string).slice(0, 70);
    console.log(`  [${m.role}] ${preview}...`);
  }

  const state = loaded.state as { models?: string[] };
  console.log(`\nModels used: ${state.models?.join(", ")}`);
  console.log(`Persistence: OK — all ${loaded.messages.length} messages survived reload`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
