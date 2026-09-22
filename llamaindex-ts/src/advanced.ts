/**
 * Advanced Example - DialogueDB + LlamaIndex OpenAIAgent
 *
 * Demonstrates the full integration:
 * - LlamaIndex OpenAIAgent with get_weather, calculate, save_note tools
 * - Every message persisted to DialogueDB, including tool calls and tool results
 * - Cold resume from a separate process invocation
 *
 * Usage:
 *   npm run advanced          # Run both invocations back-to-back
 *   npm run advanced:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run advanced:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import { OpenAI, OpenAIAgent } from "@llamaindex/openai";
import type { ChatMessage, ToolCallLLMMessageOptions } from "llamaindex";
import { DialogueDB } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { tools } from "./tools.js";
import { toLlamaMessages, saveLlamaMessage } from "./persist.js";
import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
const llm = new OpenAI({ model: "gpt-4o-mini" });

type LlamaChatMessage = ChatMessage<ToolCallLLMMessageOptions>;

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Save the new messages the agent added to its chatHistory since we last
 * saved. The agent's chatHistory grows during chat(); we diff it against
 * the count we had before to find the new entries.
 */
async function persistNewMessages(
  dialogue: Dialogue,
  agentHistory: LlamaChatMessage[],
  previousCount: number,
): Promise<void> {
  const newMessages = agentHistory.slice(previousCount);
  for (const msg of newMessages) {
    if (msg.options && "toolCall" in msg.options && Array.isArray(msg.options.toolCall)) {
      for (const call of msg.options.toolCall) {
        console.log(`   [tool] ${call.name}(${JSON.stringify(call.input)})`);
      }
    }
    if (msg.options && "toolResult" in msg.options) {
      const toolResult = msg.options.toolResult;
      console.log(`   [result] ${String(toolResult.result).slice(0, 100)}`);
    }

    await saveLlamaMessage(dialogue, msg);
  }
}

// ---------------------------------------------------------------------------
// Invocation 1 - Initial conversation with multi-tool use
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: LlamaIndex Agent with Tools ===\n");

  const dialogue = await db.createDialogue({
    label: "llamaindex-advanced-demo",
    state: { invocation: 1, started: new Date().toISOString() },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  const agent = new OpenAIAgent({
    llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
  });

  const previousCount = agent.chatHistory.length;

  console.log("Sending query that requires multiple tools...\n");
  const response = await agent.chat({
    message:
      "I'm planning a trip. Check the weather in San Francisco and Tokyo, " +
      "calculate the temperature difference in Celsius, " +
      "and save a note summarizing the comparison.",
  });

  const replyText = response.message.content.toString();
  console.log(`\nLLM: ${replyText}\n`);

  // Persist all messages the agent produced (user, assistant, tool calls, tool results)
  await persistNewMessages(dialogue, agent.chatHistory, previousCount);

  await dialogue.saveState({
    invocation: 1,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  console.log("--- Invocation 1 Summary ---");
  console.log(`Dialogue ID: ${dialogue.id}`);
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log("---\n");

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 - Cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  console.log(`Loading dialogue ${dialogueId} from scratch...`);
  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages\n`);

  // Rebuild the agent with the full conversation history from DialogueDB
  const loadedHistory: LlamaChatMessage[] = toLlamaMessages(dialogue);

  const agent = new OpenAIAgent({
    llm,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    chatHistory: loadedHistory,
  });

  const previousCount = agent.chatHistory.length;

  const followUp =
    "Based on our earlier weather comparison, which city would be better " +
    "for outdoor activities this week? Also, what note did you save?";

  console.log("Sending follow-up with restored context...\n");
  const response = await agent.chat({ message: followUp });

  const replyText = response.message.content.toString();
  console.log(`LLM: ${replyText}\n`);

  await persistNewMessages(dialogue, agent.chatHistory, previousCount);

  await dialogue.saveState({
    invocation: 2,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  console.log("--- Invocation 2 Summary ---");
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log("---\n");

  // Cleanup
  await db.deleteDialogue(dialogueId);
  console.log("Cleaned up. Done!");
}

// ---------------------------------------------------------------------------
// Main - parse flags and run
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--invocation="));
  const invocation = flag ? parseInt(flag.split("=")[1]) : 0;

  if (invocation === 1) {
    const id = await invocation1();
    console.log(
      `\nTo run invocation 2:\n  DIALOGUE_ID=${id} npm run advanced:2`,
    );
  } else if (invocation === 2) {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId) {
      throw new Error("DIALOGUE_ID env var required for invocation 2");
    }
    await invocation2(dialogueId);
  } else {
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
