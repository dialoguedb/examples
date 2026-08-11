/**
 * Demo — Type-safe chat with tRPC + DialogueDB + OpenAI
 *
 * This script:
 * 1. Creates a tRPC router backed by DialogueDB
 * 2. Starts a conversation, sends messages, gets AI responses
 * 3. Simulates a cold restart — new router instance, no in-memory state
 * 4. Loads the conversation from DialogueDB — full history preserved
 * 5. Continues the conversation with full context
 * 6. Searches past messages with semantic search
 *
 * Run:  npm run demo
 */

import { DialogueDB, setGlobalConfig } from "dialogue-db";
import OpenAI from "openai";
import { createRouter } from "./router.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

async function main() {
  console.log("=== DialogueDB + tRPC: Type-Safe Chat API ===\n");

  // --- Instance 1: Initial conversation ---
  console.log("--- Router instance 1 (initial) ---\n");
  const router1 = createRouter(new DialogueDB(), new OpenAI());
  const caller1 = router1.createCaller({});

  const { id } = await caller1.create({
    label: "trpc-demo",
    systemPrompt:
      "You are a concise travel advisor. Keep answers under 3 sentences.",
  });
  console.log(`Created dialogue: ${id}\n`);

  // First exchange
  const r1 = await caller1.send({
    dialogueId: id,
    message:
      "Hi! My name is Priya. I'm planning a two-week trip to Japan in autumn. What regions should I prioritize?",
  });
  console.log(
    "[user] Hi! My name is Priya. I'm planning a two-week trip to Japan..."
  );
  console.log(`[assistant] ${r1.reply}\n`);

  // Second exchange
  const r2 = await caller1.send({
    dialogueId: id,
    message:
      "Great suggestions. I also love hiking and onsen. Any specific routes you'd recommend?",
  });
  console.log("[user] I also love hiking and onsen. Any specific routes?");
  console.log(`[assistant] ${r2.reply}\n`);

  // --- Simulate cold restart ---
  console.log(
    "--- Router instance 2 (cold restart — new router, no in-memory state) ---\n"
  );
  const router2 = createRouter(new DialogueDB(), new OpenAI());
  const caller2 = router2.createCaller({});

  // Load message history — everything survived the restart
  const history = await caller2.history({ dialogueId: id });
  console.log(`Messages in dialogue: ${history.length}`);
  for (const m of history) {
    console.log(`  [${m.role}] ${m.content.slice(0, 80)}...`);
  }

  // Continue the conversation — GPT has full context from before the restart
  console.log("\n--- Continuing conversation after restart ---\n");
  const r3 = await caller2.send({
    dialogueId: id,
    message:
      "Quick recap: what's my name and what activities was I interested in? Then suggest a day-by-day itinerary for the first 3 days.",
  });
  console.log(
    "[user] Quick recap: what's my name and what activities was I interested in?"
  );
  console.log(`[assistant] ${r3.reply}\n`);

  // Verify context was preserved
  const lower = r3.reply.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("hik") ||
      lower.includes("onsen") ||
      lower.includes("japan"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );

  // Semantic search
  const results = await caller2.search({ query: "hiking trails", limit: 3 });
  console.log(`\nSemantic search for "hiking trails": ${results.length} results`);

  // Cleanup
  await caller2.remove({ dialogueId: id });
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
