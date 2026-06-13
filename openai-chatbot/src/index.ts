/**
 * End-to-End Chatbot — DialogueDB + OpenAI
 *
 * A complete chatbot that:
 * 1. Stores every message in DialogueDB
 * 2. Survives restarts by reloading conversation history
 * 3. Searches past conversations to give GPT relevant context
 *
 * Run: npm start
 */

import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

// -- Setup --

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You are a friendly, helpful assistant. Answer concisely. " +
  "If given context from past conversations, use it naturally — " +
  "don't mention that you searched a database.";

// -- Helpers --

/**
 * Narrow a DialogueDB role string to the union OpenAI expects.
 * Throws on unexpected roles so we catch integration bugs early.
 */
function openAIRole(role: string): "user" | "assistant" {
  if (role === "user" || role === "assistant") return role;
  throw new Error(`Unexpected message role: ${role}`);
}

/** Build the message array OpenAI needs from a DialogueDB dialogue. */
function toOpenAIMessages(
  dialogue: Dialogue,
  extraContext?: string
): OpenAI.ChatCompletionMessageParam[] {
  let systemContent = SYSTEM_PROMPT;
  if (extraContext) {
    systemContent +=
      "\n\nContext from previous conversations:\n" + extraContext;
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
  ];

  for (const m of dialogue.messages) {
    messages.push({
      role: openAIRole(m.role),
      content: String(m.content),
    });
  }

  return messages;
}

/** Send messages to GPT and return the text response. */
async function chat(
  messages: OpenAI.ChatCompletionMessageParam[]
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages,
  });
  return response.choices[0].message.content ?? "";
}

/**
 * Search DialogueDB for messages relevant to a query.
 * Returns formatted context string, or empty string if nothing found.
 */
async function findRelevantContext(query: string): Promise<string> {
  const results = await db.searchMessages(query, { limit: 3 });
  if (results.length === 0) return "";

  return results
    .map((msg) => `[${msg.role}] ${String(msg.content)}`)
    .join("\n");
}

/**
 * Run one conversation turn:
 * save user message → (optionally) search for context → call GPT → save response.
 */
async function turn(
  dialogue: Dialogue,
  userMessage: string,
  searchQuery?: string
): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  const context = searchQuery
    ? await findRelevantContext(searchQuery)
    : undefined;

  const messages = toOpenAIMessages(dialogue, context);
  const reply = await chat(messages);

  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

// -- Main --

async function main() {
  console.log("=== End-to-End Chatbot: DialogueDB + OpenAI ===\n");

  // ── Part 1: Seed past conversations ──
  // In a real app these accumulate over time. Here we create two
  // short dialogues so semantic search has something to find.

  console.log("Part 1: Seeding past conversations...\n");

  const travelDialogue = await db.createDialogue({
    label: "travel-planning",
    tags: ["chatbot-tutorial"],
    messages: [
      {
        role: "user",
        content: "I'm planning a trip to Tokyo in April.",
      },
      {
        role: "assistant",
        content:
          "April is cherry blossom season in Tokyo! Visit Ueno Park, " +
          "Shinjuku Gyoen, and the Meguro River for the best sakura viewing. " +
          "Book accommodation early — it's peak tourist season.",
      },
      {
        role: "user",
        content: "What food should I try there?",
      },
      {
        role: "assistant",
        content:
          "Must-try Tokyo food: fresh sushi at Tsukiji Outer Market, " +
          "tonkotsu ramen in Shinjuku, takoyaki (octopus balls), and tempura. " +
          "For a special meal, book an omakase counter — a multi-course " +
          "tasting menu chosen by the chef.",
      },
    ],
  });
  console.log(`  Created "travel-planning": ${travelDialogue.id}`);

  const cookingDialogue = await db.createDialogue({
    label: "cooking-help",
    tags: ["chatbot-tutorial"],
    messages: [
      {
        role: "user",
        content: "How do I make authentic pasta carbonara?",
      },
      {
        role: "assistant",
        content:
          "Classic carbonara: guanciale, eggs, Pecorino Romano, black pepper, " +
          "and spaghetti. The key is tossing hot pasta with the egg-cheese " +
          "mixture OFF the heat — this creates the creamy sauce without " +
          "scrambling the eggs.",
      },
      {
        role: "user",
        content: "Can I use bacon instead of guanciale?",
      },
      {
        role: "assistant",
        content:
          "Bacon works but tastes smokier. Pancetta is a closer substitute. " +
          "If using bacon, avoid any with maple or sweet glazes — you want " +
          "pure pork flavor for carbonara.",
      },
    ],
  });
  console.log(`  Created "cooking-help": ${cookingDialogue.id}\n`);

  // ── Part 2: New conversation with persistence + search ──
  // Each user message is saved to DialogueDB. When the question relates
  // to a past topic, we search for relevant context and inject it into
  // the system prompt so GPT can draw on cross-conversation memory.

  console.log("Part 2: Chatting with GPT (every message persisted)...\n");

  const dialogue = await db.createDialogue({
    label: "chatbot-tutorial-session",
    tags: ["chatbot-tutorial"],
    state: { model: MODEL, started: new Date().toISOString() },
  });
  console.log(`  New dialogue: ${dialogue.id}\n`);

  // Turn 1 — no search needed, just a greeting
  const msg1 =
    "Hi! I'm looking for dinner ideas tonight. Something Italian maybe?";
  console.log(`  User: ${msg1}`);
  const r1 = await turn(dialogue, msg1);
  console.log(`  GPT:  ${r1.slice(0, 200)}\n`);

  // Turn 2 — search finds the carbonara conversation from Part 1
  const msg2 = "How about carbonara? Do you have a good recipe?";
  console.log(`  User: ${msg2}`);
  const r2 = await turn(dialogue, msg2, "carbonara recipe technique");
  console.log(`  GPT:  ${r2.slice(0, 200)}\n`);

  // Turn 3 — search finds the Tokyo food conversation from Part 1
  const msg3 =
    "Switching topics — I'm going to Tokyo soon. What should I eat there?";
  console.log(`  User: ${msg3}`);
  const r3 = await turn(dialogue, msg3, "Tokyo food recommendations");
  console.log(`  GPT:  ${r3.slice(0, 200)}\n`);

  console.log(`  Messages stored: ${dialogue.messages.length}\n`);

  // ── Part 3: Cold restart ──
  // Simulate the server/process restarting. Load the dialogue from
  // DialogueDB and continue the conversation with full history.

  console.log("Part 3: Cold restart — reloading from DialogueDB...\n");

  const savedId = dialogue.id;

  const resumed = await db.getDialogue(savedId);
  if (!resumed) throw new Error("Dialogue not found after restart");
  await resumed.loadMessages({ order: "asc" });

  console.log(`  Loaded ${resumed.messages.length} messages`);
  for (const msg of resumed.messages.slice(-4)) {
    const preview = String(msg.content).slice(0, 80);
    console.log(`    [${msg.role}] ${preview}...`);
  }

  const msg4 = "Quick recap — what have we discussed so far?";
  console.log(`\n  User: ${msg4}`);
  const r4 = await turn(resumed, msg4);
  console.log(`  GPT:  ${r4}\n`);

  // Verify GPT retained context across the restart
  const lower = r4.toLowerCase();
  const remembered =
    (lower.includes("carbonara") || lower.includes("italian")) &&
    (lower.includes("tokyo") || lower.includes("japan"));
  console.log(
    `  Context preserved across restart: ${remembered ? "YES" : "NO"}\n`
  );

  // ── Part 4: Semantic search demo ──
  // Show searching across ALL stored conversations by meaning.

  console.log("Part 4: Semantic search across all conversations...\n");

  const queries = [
    "Japanese cuisine",
    "Italian pasta techniques",
    "travel tips for Asia",
  ];
  for (const query of queries) {
    const results = await db.searchMessages(query, { limit: 3 });
    console.log(
      `  Search: "${query}" → ${results.length} result(s)`
    );
    for (const item of results) {
      console.log(
        `    [${item.role}] ${String(item.content).slice(0, 90)}...`
      );
    }
    console.log();
  }

  // ── Cleanup ──

  await db.deleteDialogue(travelDialogue.id);
  await db.deleteDialogue(cookingDialogue.id);
  await db.deleteDialogue(dialogue.id);
  console.log("Cleaned up all dialogues. Done!");
}

main().catch(console.error);
