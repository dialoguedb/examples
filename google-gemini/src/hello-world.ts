/**
 * Hello World - DialogueDB + Google Gemini SDK
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Gemini, saving every message
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - Gemini has full context from before the restart
 *
 * No tools, no state management. Just: save -> load -> Gemini remembers.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Content } from "@google/generative-ai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const db = new DialogueDB();
const MODEL = "gemini-2.0-flash";

/** Convert DialogueDB messages to Gemini's Content format. */
function toGeminiHistory(dialogue: Dialogue): Content[] {
  return dialogue.messages.map((m) => ({
    // Gemini uses "model" instead of "assistant"
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content as string }],
  }));
}

/**
 * Send a user message to Gemini with prior conversation history.
 * Gemini's startChat takes the prior turns as `history`, then sendMessage
 * sends the new user turn. This mirrors the stateless pattern — every call
 * rebuilds context from DialogueDB.
 */
async function sendToGemini(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  // Build history from all previously saved messages (excludes the new one)
  const history = toGeminiHistory(dialogue);
  const model = genAI.getGenerativeModel({ model: MODEL });
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}

async function main() {
  console.log("=== DialogueDB + Google Gemini: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "gemini-hello-world",
    state: { provider: "google", format: "gemini-chat", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  const userMsg1 =
    "Hi! My name is Priya and I'm building a language learning app " +
    "that uses spaced repetition and AI-generated practice conversations. " +
    "What tech stack would you recommend?";

  const reply1 = await sendToGemini(dialogue, userMsg1);
  // Persist both turns — "assistant" for cross-provider consistency
  await dialogue.saveMessage({ role: "user", content: userMsg1 });
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - Gemini: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  const userMsg2 =
    "Great ideas. I also want to support real-time pronunciation feedback " +
    "and progress tracking with streak mechanics. How would those fit in?";

  const reply2 = await sendToGemini(dialogue, userMsg2);
  await dialogue.saveMessage({ role: "user", content: userMsg2 });
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - Gemini: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - Gemini should have full context
  const userMsg3 =
    "Quick recap: what's my name, what am I building, and what specific " +
    "features did we discuss?";

  const reply3 = await sendToGemini(resumed, userMsg3);
  await resumed.saveMessage({ role: "user", content: userMsg3 });
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - Gemini:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("language") ||
      lower.includes("spaced repetition") ||
      lower.includes("pronunciation"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
