/**
 * Streaming - DialogueDB + Mistral AI SDK
 *
 * Shows how to stream responses in real time while persisting the
 * complete conversation to DialogueDB:
 * 1. Stream a response from Mistral (printing chunks as they arrive)
 * 2. Save the accumulated response to DialogueDB once complete
 * 3. Simulate a cold restart
 * 4. Stream another response with full prior context
 */

import { Mistral } from "@mistralai/mistralai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY ?? "",
});
const db = new DialogueDB();
const MODEL = "mistral-large-latest";

type Message =
  | { role: "user"; content: string | null }
  | { role: "assistant"; content: string | null };

function toMistralMessages(dialogue: Dialogue): Message[] {
  const messages: Message[] = [];
  for (const m of dialogue.messages) {
    const content = typeof m.content === "string" ? m.content : null;
    if (m.role === "user") {
      messages.push({ role: "user", content });
    } else if (m.role === "assistant") {
      messages.push({ role: "assistant", content });
    }
  }
  return messages;
}

async function streamChat(messages: Message[]): Promise<string> {
  const stream = await mistral.chat.stream({
    model: MODEL,
    maxTokens: 1024,
    messages,
  });

  // Print chunks as they arrive, accumulate the full response
  let fullContent = "";
  for await (const event of stream) {
    const delta = event.data.choices[0]?.delta?.content;
    if (typeof delta === "string") {
      process.stdout.write(delta);
      fullContent += delta;
    }
  }
  process.stdout.write("\n");
  return fullContent;
}

async function main() {
  console.log("=== DialogueDB + Mistral AI SDK: Streaming ===\n");

  const dialogue = await db.createDialogue({
    label: "mistral-streaming-demo",
    state: { provider: "mistral", format: "mistral-chat", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 1. First exchange - stream the response
  await dialogue.saveMessage({
    role: "user",
    content:
      "I'm designing a REST API for a bookstore. Give me a concise overview of the main endpoints I'd need, with HTTP methods and brief descriptions.",
  });

  console.log("Streaming response 1:\n");
  const reply1 = await streamChat(toMistralMessages(dialogue));
  // Save the complete response after streaming finishes
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`\n(Saved ${reply1.length} chars to DialogueDB)\n`);

  // 2. Follow-up - stream another response
  await dialogue.saveMessage({
    role: "user",
    content:
      "Now add authentication and pagination to that design. How would the endpoints change?",
  });

  console.log("Streaming response 2:\n");
  const reply2 = await streamChat(toMistralMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`\n(Saved ${reply2.length} chars to DialogueDB)\n`);

  // 3. COLD RESTART
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 4. Continue with full context after restart
  await resumed.saveMessage({
    role: "user",
    content:
      "Summarize the full API design we've discussed so far in a short bullet list.",
  });

  console.log("Streaming response 3 (after restart):\n");
  const reply3 = await streamChat(toMistralMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`\n(Saved ${reply3.length} chars to DialogueDB)`);

  // Verify context survived the restart
  const lower = reply3.toLowerCase();
  const hasContext =
    lower.includes("book") &&
    (lower.includes("auth") || lower.includes("paginat"));
  console.log(
    `\nContext preserved across restart: ${hasContext ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
