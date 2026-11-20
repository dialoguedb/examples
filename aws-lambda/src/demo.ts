/**
 * Demo — Simulates multiple Lambda invocations to prove DialogueDB persistence
 *
 * Each call to invokeLambda() simulates a separate cold start:
 * - Fresh DialogueDB instance (no in-memory state)
 * - Loads conversation history from the API by ID
 * - Sends user message + full context to the LLM
 * - Persists the response for the next invocation
 *
 * The only thing passed between invocations is the conversationId.
 * DialogueDB provides the memory.
 *
 * Run:  npm run demo
 */

import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You are a helpful assistant. Be concise (2-3 sentences). " +
  "Remember context from earlier in the conversation.";

function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

/**
 * Simulate a single Lambda invocation.
 *
 * Each call creates a fresh DialogueDB instance — no shared in-memory state.
 * This mirrors what happens in a real Lambda: every invocation starts clean,
 * and DialogueDB is the only source of conversation context.
 */
async function invokeLambda(
  message: string,
  conversationId?: string
): Promise<{ conversationId: string; reply: string }> {
  // Fresh instance — just like a cold-start Lambda
  const db = new DialogueDB();

  const dialogue = conversationId
    ? await db.getOrCreateDialogue({ id: conversationId })
    : await db.createDialogue({
        label: "lambda-demo",
        state: { provider: "openai", model: MODEL },
      });

  // Load conversation history from DialogueDB
  await dialogue.loadMessages({ order: "asc" });

  // Persist the user's message
  await dialogue.saveMessage({ role: "user", content: message });

  // Call OpenAI with the full conversation history
  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...toOpenAIMessages(dialogue),
    ],
  });

  const reply = completion.choices[0].message.content ?? "";

  // Persist the assistant's response
  await dialogue.saveMessage({ role: "assistant", content: reply });

  return { conversationId: dialogue.id, reply };
}

async function main() {
  console.log("=== DialogueDB + AWS Lambda: Stateless Chat Demo ===\n");

  // --- Invocation 1: Start a conversation ---
  console.log("--- Lambda Invocation 1 (cold start) ---\n");
  const r1 = await invokeLambda(
    "Hi! My name is Luna and I'm designing a habitat for Mars. " +
      "What's the biggest engineering challenge I should focus on first?"
  );
  console.log(`Conversation: ${r1.conversationId}`);
  console.log(`[user] Hi! My name is Luna and I'm designing a Mars habitat...`);
  console.log(`[assistant] ${r1.reply.slice(0, 200)}...\n`);

  // --- Invocation 2: Continue with just the conversationId ---
  console.log("--- Lambda Invocation 2 (new cold start, same conversation) ---\n");
  const r2 = await invokeLambda(
    "What materials would work best for radiation shielding on Mars?",
    r1.conversationId
  );
  console.log(`[user] What materials would work best for radiation shielding?`);
  console.log(`[assistant] ${r2.reply.slice(0, 200)}...\n`);

  // --- Invocation 3: Prove full context is preserved ---
  console.log("--- Lambda Invocation 3 (another cold start) ---\n");
  const r3 = await invokeLambda(
    "Quick recap: what's my name, what am I building, and what topics did we cover?",
    r1.conversationId
  );
  console.log(`[user] Quick recap: what's my name and what are we working on?`);
  console.log(`[assistant] ${r3.reply}\n`);

  // Verify context was preserved across all three invocations
  const lower = r3.reply.toLowerCase();
  const remembered =
    lower.includes("luna") &&
    (lower.includes("mars") ||
      lower.includes("habitat") ||
      lower.includes("radiation"));
  console.log(
    `Context preserved across 3 cold starts: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: 6 (3 user + 3 assistant)`);

  // Cleanup
  const db = new DialogueDB();
  await db.deleteDialogue(r1.conversationId);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
