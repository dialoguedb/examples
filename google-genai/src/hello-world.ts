/**
 * Hello World - DialogueDB + Google GenAI SDK (Gemini)
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Gemini, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Gemini has full context from before the restart
 *
 * No tools, no state management. Just: save -> load -> Gemini remembers.
 */

import { GoogleGenAI, type Content } from "@google/genai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = new DialogueDB();
const MODEL = "gemini-2.5-flash";

/** Send a contents array to Gemini, return the text response. */
async function chat(contents: Content[]): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
  });
  return response.text ?? "";
}

/** Convert DialogueDB messages to Gemini Content format. */
function toGeminiContents(dialogue: Dialogue): Content[] {
  return dialogue.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content) }],
  }));
}

async function main() {
  console.log("=== DialogueDB + Google GenAI SDK: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "gemini-hello-world",
    state: { provider: "google", format: "gemini-content", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Priya and I'm building a language learning app that uses AI to generate contextual practice sentences based on difficulty level. What architecture would you suggest?",
  });
  const reply1 = await chat(toGeminiContents(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Gemini: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Great suggestions. I also want to support spaced repetition and pronunciation feedback. How would you extend the architecture for those?",
  });
  const reply2 = await chat(toGeminiContents(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - Gemini: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - Gemini should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific features did we discuss?",
  });
  const reply3 = await chat(toGeminiContents(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Gemini:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("language") ||
      lower.includes("learning") ||
      lower.includes("practice"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
