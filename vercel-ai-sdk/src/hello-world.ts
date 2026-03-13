/**
 * Hello World - DialogueDB + Vercel AI SDK
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Claude via the Vercel AI SDK's generateText
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Claude has full context from before the restart
 *
 * The Vercel AI SDK is the most popular framework for building AI chat apps.
 * It runs on serverless (Next.js on Vercel, Cloudflare Workers, etc.) where
 * state is lost between requests. DialogueDB solves this.
 */

import { generateText, type CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const model = anthropic("claude-sonnet-4-20250514");

/** Send a message array to Claude via the Vercel AI SDK. */
async function chat(messages: CoreMessage[]): Promise<string> {
  const { text } = await generateText({
    model,
    messages,
  });
  return text;
}

/** Convert DialogueDB messages to Vercel AI SDK CoreMessage format. */
function toCoreMessages(
  dialogue: InstanceType<typeof import("dialogue-db").Dialogue>
): CoreMessage[] {
  return dialogue.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));
}

async function main() {
  console.log("=== DialogueDB + Vercel AI SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "vercel-ai-hello-world" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Marcus and I'm building a recipe recommendation app " +
      "with Next.js on Vercel. What database would you recommend for storing recipes?",
  });
  const reply1 = await chat(toCoreMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Claude: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Good suggestions. I also want AI-powered ingredient substitution. " +
      "How should I structure the prompts for that feature?",
  });
  const reply2 = await chat(toCoreMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - Claude: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  //    This simulates what happens between serverless invocations:
  //    new Lambda, new Edge Function, new request handler — zero in-memory state.
  console.log("--- Simulating cold restart (new serverless invocation) ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - Claude should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what features did we discuss?",
  });
  const reply3 = await chat(toCoreMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Claude:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("marcus") &&
    (lower.includes("recipe") || lower.includes("next"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
