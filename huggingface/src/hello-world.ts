/**
 * Hello World - DialogueDB + Hugging Face Inference API
 *
 * Persist conversations with open-source models hosted on Hugging Face:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with an open-source model via HF Inference API
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — the model has full context from before
 */

import { InferenceClient } from "@huggingface/inference";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const client = new InferenceClient(process.env.HF_ACCESS_TOKEN);
const db = new DialogueDB();
const MODEL =
  process.env.HF_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.3";

/** Send a message array to the HF model and return the text response. */
async function chat(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await client.chatCompletion({
    model: MODEL,
    max_tokens: 512,
    messages,
  });
  return response.choices[0].message.content ?? "";
}

/** Convert DialogueDB messages to the { role, content } format HF expects. */
function toMessages(
  dialogue: Dialogue
): Array<{ role: string; content: string }> {
  return dialogue.messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content),
  }));
}

async function main() {
  console.log("=== DialogueDB + Hugging Face Inference: Hello World ===");
  console.log(`Model: ${MODEL}\n`);

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "huggingface-hello-world",
    state: { provider: "huggingface", format: "openai-chat", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Priya and I'm building a wildlife tracking app that uses AI to identify animal species from trail camera photos. What tech stack would you recommend?",
  });
  const reply1 = await chat(toMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Good ideas. I also want to add migration pattern tracking and habitat mapping. How would those fit into the architecture?",
  });
  const reply2 = await chat(toMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation — model should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what features did we discuss?",
  });
  const reply3 = await chat(toMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart):\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("wildlife") ||
      lower.includes("animal") ||
      lower.includes("tracking"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
