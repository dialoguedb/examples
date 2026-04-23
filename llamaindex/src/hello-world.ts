/**
 * Hello World - DialogueDB + LlamaIndex.TS
 *
 * LlamaIndex's built-in chat memory is in-memory only — it disappears
 * when the process exits. DialogueDB gives it persistence:
 *
 * 1. Create a conversation in DialogueDB
 * 2. Chat via LlamaIndex's SimpleChatEngine
 * 3. Simulate a cold restart — load the conversation fresh
 * 4. Feed the history back into the engine — the LLM remembers everything
 */

import { OpenAI, SimpleChatEngine } from "llamaindex";
import type { ChatMessage, MessageType } from "llamaindex";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const MODEL = "gpt-4o-mini";
const llm = new OpenAI({ model: MODEL, maxTokens: 1024 });

function isMessageRole(role: string): role is MessageType {
  return (
    role === "user" ||
    role === "assistant" ||
    role === "system" ||
    role === "memory" ||
    role === "developer"
  );
}

function toLlamaIndexHistory(dialogue: Dialogue): ChatMessage[] {
  return dialogue.messages.map((m) => {
    const role = m.role;
    const content = m.content;
    if (!isMessageRole(role)) {
      throw new Error(`Unexpected message role: ${role}`);
    }
    if (typeof content !== "string") {
      throw new Error("Expected string message content from DialogueDB");
    }
    return { role, content };
  });
}

async function main() {
  console.log("=== DialogueDB + LlamaIndex.TS: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "llamaindex-hello-world",
    state: { provider: "llamaindex", format: "llamaindex-chat", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — use SimpleChatEngine with no prior history
  const userMessage1 =
    "Hi! My name is Ada and I'm building a document search tool that uses embeddings to find relevant paragraphs across thousands of PDFs. What indexing strategy would you recommend?";

  await dialogue.saveMessage({ role: "user", content: userMessage1 });

  const engine1 = new SimpleChatEngine({ llm });
  const response1 = await engine1.chat({ message: userMessage1 });
  const reply1 = response1.toString();
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1 - LLM: ${reply1.slice(0, 150)}...\n`);

  // 3. Second exchange — pass prior history so the LLM has context
  const userMessage2 =
    "Good ideas. I also need to handle scanned documents with OCR and support multilingual search across English, Spanish, and Japanese. How would that change the approach?";

  await dialogue.saveMessage({ role: "user", content: userMessage2 });

  const engine2 = new SimpleChatEngine({ llm });
  const response2 = await engine2.chat({
    message: userMessage2,
    chatHistory: toLlamaIndexHistory(dialogue).slice(0, -1),
  });
  const reply2 = response2.toString();
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2 - LLM: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation with a new engine instance + full history
  const userMessage3 =
    "Quick recap: what's my name, what am I building, and what specific challenges did we discuss?";

  await resumed.saveMessage({ role: "user", content: userMessage3 });

  const engine3 = new SimpleChatEngine({ llm });
  const response3 = await engine3.chat({
    message: userMessage3,
    chatHistory: toLlamaIndexHistory(resumed).slice(0, -1),
  });
  const reply3 = response3.toString();
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart) - LLM:\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("ada") &&
    (lower.includes("document") ||
      lower.includes("search") ||
      lower.includes("pdf") ||
      lower.includes("embedding"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
