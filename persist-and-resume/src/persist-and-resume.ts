/**
 * Persist and Resume a Conversation
 *
 * The most common beginner use case:
 * 1. User starts a conversation and sends a few messages
 * 2. User leaves (process ends, browser closes, server restarts)
 * 3. User comes back — conversation picks up where it left off
 *
 * This example uses only DialogueDB (no LLM SDK required).
 * To integrate with your LLM, pass the loaded messages as context.
 */

import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();

async function main() {
  // ── Step 1: Start a conversation and save some messages ──

  const dialogue = await db.createDialogue({
    label: "tutoring-session",
    tags: ["student-123", "biology"],
  });

  console.log(`Created dialogue: ${dialogue.id}`);

  await dialogue.saveMessage({
    role: "user",
    content: "Explain photosynthesis in simple terms",
  });

  await dialogue.saveMessage({
    role: "assistant",
    content:
      "Photosynthesis is how plants turn sunlight, water, and CO2 into food (glucose) and oxygen. Think of it as a plant's way of cooking lunch using sunlight!",
  });

  await dialogue.saveMessage({
    role: "user",
    content: "What is the chemical equation?",
  });

  await dialogue.saveMessage({
    role: "assistant",
    content: "6CO2 + 6H2O + light energy → C6H12O6 + 6O2",
  });

  const savedId = dialogue.id;
  console.log(`Saved ${dialogue.messages.length} messages`);
  console.log(`Dialogue ID to resume later: ${savedId}\n`);

  // ── Step 2: Simulate leaving (cold restart) ──

  console.log("--- User closes the app / server restarts ---\n");

  // ── Step 3: Come back and resume ──

  const resumed = await db.getDialogue(savedId);
  if (!resumed) throw new Error("Dialogue not found");

  await resumed.loadMessages({ order: "asc" });
  console.log(
    `Resumed dialogue with ${resumed.messages.length} previous messages:`
  );
  for (const msg of resumed.messages) {
    console.log(`  [${msg.role}] ${(msg.content as string).slice(0, 60)}...`);
  }

  // ── Step 4: Continue the conversation ──

  await resumed.saveMessage({
    role: "user",
    content: "Which part of the plant cell does this happen in?",
  });

  await resumed.saveMessage({
    role: "assistant",
    content:
      "Photosynthesis happens in the chloroplasts — specifically in structures called thylakoids (light reactions) and the stroma (Calvin cycle).",
  });

  console.log(`\nConversation now has ${resumed.messages.length} messages`);

  // ── Tip: Pass loaded messages to your LLM ──
  //
  // const history = resumed.messages.map((m) => ({
  //   role: m.role as "user" | "assistant",
  //   content: m.content as string,
  // }));
  //
  // const response = await yourLLM.chat({ messages: history });

  // Cleanup
  await db.deleteDialogue(savedId);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
