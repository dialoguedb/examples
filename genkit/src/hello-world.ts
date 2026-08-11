/**
 * Hello World — DialogueDB + Genkit
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with Gemini via Genkit, saving every message
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Continue chatting — Gemini has full context from before the restart
 *
 * No tools, no flows. Just: save -> load -> Gemini remembers.
 */

import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const ai = genkit({ plugins: [googleAI()] });
const db = new DialogueDB();
const gemini = googleAI.model("gemini-2.0-flash");

/** Map a DialogueDB role string to Genkit's literal role type. */
function genkitRole(role: string): "user" | "model" {
  if (role === "model") return "model";
  return "user";
}

/** Convert DialogueDB messages to Genkit's message format. */
function toGenkitMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) => ({
    role: genkitRole(m.role),
    content: [
      {
        text:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content),
      },
    ],
  }));
}

/** Send the full conversation to Gemini, return the text response. */
async function chat(dialogue: Dialogue): Promise<string> {
  const messages = toGenkitMessages(dialogue);
  const history = messages.slice(0, -1);
  const lastMessage = messages[messages.length - 1];
  const prompt = lastMessage.content[0].text;

  const response = await ai.generate({
    model: gemini,
    ...(history.length > 0 ? { messages: history } : {}),
    prompt,
  });
  return response.text;
}

async function main() {
  console.log("=== DialogueDB + Genkit: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "genkit-hello-world",
    state: { provider: "google", format: "genkit", model: "gemini-2.0-flash" },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Priya and I'm building a meditation app that uses AI to generate personalized guided sessions. What architecture would you suggest?",
  });
  const reply1 = await chat(dialogue);
  await dialogue.saveMessage({ role: "model", content: reply1 });
  console.log(`Exchange 1 — Gemini: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Great ideas. I also want to track mood over time and suggest sessions based on patterns. How would you extend the design?",
  });
  const reply2 = await chat(dialogue);
  await dialogue.saveMessage({ role: "model", content: reply2 });
  console.log(`Exchange 2 — Gemini: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation — Gemini should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what features did we discuss?",
  });
  const reply3 = await chat(resumed);
  await resumed.saveMessage({ role: "model", content: reply3 });
  console.log(`Exchange 3 (after restart) — Gemini:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("priya") &&
    (lower.includes("meditation") ||
      lower.includes("mood") ||
      lower.includes("guided"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
