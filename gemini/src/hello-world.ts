/**
 * Hello World - DialogueDB + Google Gemini
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Gemini, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Gemini has full context from before the restart
 *
 * No tools, no state management. Just: save -> load -> Gemini remembers.
 *
 * The Gemini API is stateless: every `generateContent` call needs the full
 * conversation history. DialogueDB is that history store, so the model
 * picks up exactly where it left off across processes/restarts.
 */

import { GoogleGenAI, type Content } from "@google/genai";
import { DialogueDB, setGlobalConfig, type Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const db = new DialogueDB();
const MODEL = "gemini-2.0-flash";

/**
 * Convert DialogueDB messages (role: "user" | "assistant") to Gemini
 * Content (role: "user" | "model"). Gemini's convention uses "model"
 * for its own replies; we stick with "assistant" in DialogueDB so the
 * data is portable across providers.
 */
function toGeminiContents(dialogue: Dialogue): Content[] {
  return dialogue.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content as string }],
  }));
}

/** Send the full history to Gemini, return the text reply. */
async function chat(contents: Content[]): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
  });
  return response.text ?? "";
}

async function main() {
  console.log("=== DialogueDB + Google Gemini: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "gemini-hello-world",
    state: { provider: "google", format: "gemini-contents", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Priya and I'm building a plant-care reminder app that uses computer vision to identify plants from photos. What ML approach would you recommend?",
  });
  const reply1 = await chat(toGeminiContents(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Gemini: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Nice. I also want to detect early signs of disease from leaf images and suggest treatments. How would the pipeline change?",
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
    (lower.includes("plant") || lower.includes("leaf") || lower.includes("disease"));
  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
