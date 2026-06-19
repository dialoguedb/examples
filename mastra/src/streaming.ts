/**
 * Streaming Example — DialogueDB + Mastra Agent
 *
 * Shows how to stream agent responses while still persisting
 * the complete conversation to DialogueDB.
 */

import { Agent } from "@mastra/core/agent";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();

const agent = new Agent({
  id: "storyteller",
  name: "Storyteller",
  instructions:
    "You are a creative storyteller. When asked, tell short, " +
    "engaging stories in 2-3 paragraphs. Remember details from earlier in the conversation.",
  model: "openai/gpt-4o-mini",
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

function toMessages(dialogue: Dialogue): Message[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

async function streamChat(dialogue: Dialogue, userMessage: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  const messages = toMessages(dialogue);
  const stream = await agent.stream(messages);

  // Stream tokens to stdout as they arrive
  let fullText = "";
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
    fullText += chunk;
  }
  process.stdout.write("\n");

  // Persist the complete response after streaming finishes
  await dialogue.saveMessage({
    role: "assistant",
    content: fullText,
    metadata: { streamed: true },
  });

  return fullText;
}

async function main() {
  console.log("=== DialogueDB + Mastra: Streaming ===\n");

  const dialogue = await db.createDialogue({
    label: "mastra-streaming-demo",
    state: { framework: "mastra", model: "gpt-4o-mini", mode: "streaming" },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // First story
  console.log("User: Tell me a short story about a robot who learns to cook.\n");
  console.log("Agent (streaming): ");
  await streamChat(
    dialogue,
    "Tell me a short story about a robot who learns to cook."
  );

  // Follow-up referencing the first story
  console.log("\nUser: Now continue the story — what does the robot cook for its first dinner party?\n");
  console.log("Agent (streaming): ");
  await streamChat(
    dialogue,
    "Now continue the story — what does the robot cook for its first dinner party?"
  );

  console.log(`\nMessages persisted: ${dialogue.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("Cleaned up. Done!");
}

main().catch(console.error);
