/**
 * DialogueDB + tRPC Demo
 *
 * Runs a multi-turn conversation using the tRPC router directly (no HTTP
 * server needed). Shows:
 *   1. Type-safe procedure calls with full inference
 *   2. Persistent conversation history via DialogueDB
 *   3. Cold restart — a new caller resumes the conversation with full context
 */

import { createCaller } from "./router.js";

async function main() {
  console.log("=== DialogueDB + tRPC: Type-Safe Chat API ===\n");

  // createCaller gives you the same typed API a tRPC client would use,
  // but calls procedures directly — no network round-trip.
  const api = createCaller({});

  // 1. Create a chat with a system prompt stored in DialogueDB state
  const chat = await api.create({
    label: "trpc-demo",
    systemPrompt:
      "You are a concise travel advisor. Keep responses under 3 sentences.",
  });
  console.log(`Created chat: ${chat.id}\n`);

  // 2. First exchange — tRPC validates the input with Zod automatically
  const reply1 = await api.send({
    chatId: chat.id,
    message:
      "I'm planning a week in Tokyo in April. What should I prioritize?",
  });
  console.log("User:      I'm planning a week in Tokyo in April.");
  console.log(`Assistant: ${reply1.content}\n`);

  // 3. Follow-up — DialogueDB feeds the full history to OpenAI
  const reply2 = await api.send({
    chatId: chat.id,
    message: "What about day trips from there?",
  });
  console.log("User:      What about day trips from there?");
  console.log(`Assistant: ${reply2.content}\n`);

  // 4. Cold restart — create a fresh caller with no in-memory state
  console.log("--- Simulating cold restart ---\n");
  const freshApi = createCaller({});

  // DialogueDB: load the persisted history (proves data survived the restart)
  const history = await freshApi.history({ chatId: chat.id });
  console.log(`Loaded ${history.length} messages from DialogueDB\n`);

  // 5. Continue the conversation — OpenAI gets full context from DialogueDB
  const reply3 = await freshApi.send({
    chatId: chat.id,
    message:
      "Remind me: what city was I asking about, and what did you recommend first?",
  });
  console.log("User:      Remind me: what city and what did you recommend?");
  console.log(`Assistant: ${reply3.content}\n`);

  // Verify context was preserved across the restart
  const lower = reply3.content.toLowerCase();
  const remembered =
    lower.includes("tokyo") &&
    (lower.includes("cherry") ||
      lower.includes("blossom") ||
      lower.includes("april") ||
      lower.includes("sakura"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${history.length + 2}`);

  // 6. Cleanup — delete the chat and all its messages
  await freshApi.delete({ chatId: chat.id });
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
