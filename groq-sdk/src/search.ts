/**
 * Semantic Search - DialogueDB + Groq SDK
 *
 * Shows how to use DialogueDB's semantic search to find relevant past
 * conversations and inject them as context for Groq-powered responses.
 *
 * 1. Create a dialogue and have a multi-turn conversation
 * 2. Search past messages by meaning (not just keywords)
 * 3. Use search results as context for a new conversation
 */

import Groq from "groq-sdk";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const groq = new Groq();
const db = new DialogueDB();
const MODEL = "llama-3.3-70b-versatile";

async function chat(
  messages: Groq.Chat.ChatCompletionMessageParam[]
): Promise<string> {
  const response = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages,
  });
  return response.choices[0].message.content ?? "";
}

function toGroqMessages(
  dialogue: Dialogue
): Groq.Chat.ChatCompletionMessageParam[] {
  return dialogue.messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.content),
  }));
}

async function main() {
  console.log("=== DialogueDB + Groq SDK: Semantic Search ===\n");

  // 1. Build up a conversation with specific domain knowledge
  const dialogue = await db.createDialogue({
    label: "groq-search-demo",
    state: { provider: "groq", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  const questions = [
    "What are the key differences between PostgreSQL and MySQL for handling JSON data?",
    "How does PostgreSQL's JSONB indexing work with GIN indexes?",
    "What's the best way to handle database migrations in a microservices architecture?",
  ];

  for (const question of questions) {
    await dialogue.saveMessage({ role: "user", content: question });
    const reply = await chat(toGroqMessages(dialogue));
    await dialogue.saveMessage({ role: "assistant", content: reply });
    console.log(`Q: ${question}`);
    console.log(`A: ${reply.slice(0, 100)}...\n`);
  }

  // 2. Search past messages by meaning — not keyword matching
  console.log("--- Semantic Search ---\n");

  const results = await db.searchMessages("JSON storage and indexing performance");

  console.log(`Found ${results.length} relevant messages:\n`);
  for (const message of results.slice(0, 3)) {
    const content = String(message.content);
    console.log(`  [${message.role}] ${content.slice(0, 80)}...`);
  }

  // 3. Use search results as context in a new conversation
  console.log("\n--- New Conversation with Search Context ---\n");

  const contextSnippets = results
    .slice(0, 3)
    .map((m) => String(m.content))
    .join("\n\n");

  const newDialogue = await db.createDialogue({
    label: "groq-search-followup",
    state: { provider: "groq", model: MODEL },
  });

  const contextualQuestion =
    "Based on our earlier discussion about database technologies, " +
    "should I use PostgreSQL or MongoDB for a new analytics dashboard " +
    "that needs to store and query nested JSON event data?";

  await newDialogue.saveMessage({
    role: "user",
    content: contextualQuestion,
  });

  const messagesWithContext: Groq.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a helpful assistant. Here is relevant context from previous conversations:\n\n${contextSnippets}`,
    },
    ...toGroqMessages(newDialogue),
  ];

  const contextualReply = await chat(messagesWithContext);
  await newDialogue.saveMessage({
    role: "assistant",
    content: contextualReply,
  });

  console.log(`Q: ${contextualQuestion}\n`);
  console.log(`A (with context): ${contextualReply}\n`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  await db.deleteDialogue(newDialogue.id);
  console.log("Cleaned up. Done!");
}

main().catch(console.error);
