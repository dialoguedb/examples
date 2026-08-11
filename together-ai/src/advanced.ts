/**
 * Advanced Example - DialogueDB + Together AI
 *
 * Demonstrates the full integration:
 * - Tool calling with Llama 3.1 via Together AI
 * - Every message persisted to DialogueDB, including tool calls and results
 * - Cold resume from a separate process invocation
 * - Token usage tracking in message metadata
 *
 * Usage:
 *   npm run advanced          # Run both invocations back-to-back
 *   npm run advanced:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run advanced:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import Together from "together-ai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import type { ToolChoice } from "together-ai/resources/completions";
import { tools, executeTool } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const together = new Together();
const db = new DialogueDB();
const MODEL = "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo";

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/**
 * Together AI's CompletionCreateParams.Message type only includes role and
 * content. The API actually accepts the full OpenAI-compatible message format
 * including tool_calls and tool_call_id, but the SDK types don't reflect this.
 *
 * We define a complete message interface that captures what the API accepts.
 * This is structurally compatible with CompletionCreateParams.Message (it has
 * all required fields) so TypeScript allows it.
 */
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolChoice[];
  tool_call_id?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert DialogueDB messages to Together AI format.
 *
 * Messages with tool_calls or tool role are stored as objects in DialogueDB's
 * content field so we can reconstruct them exactly.
 */
function toMessages(dialogue: Dialogue): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const m of dialogue.messages) {
    if (m.metadata?.hasToolCalls) {
      // Assistant message with tool_calls - stored as full message object
      messages.push(m.content as ChatMessage);
    } else if (m.role === "tool") {
      // Tool result - stored as full message object
      messages.push(m.content as ChatMessage);
    } else {
      messages.push({
        role: m.role as "user" | "assistant",
        content: String(m.content),
      });
    }
  }

  return messages;
}

/** Sum token usage from message metadata across a dialogue. */
function sumTokens(dialogue: Dialogue) {
  let input = 0;
  let output = 0;
  for (const m of dialogue.messages) {
    if (m.metadata?.prompt_tokens) input += Number(m.metadata.prompt_tokens);
    if (m.metadata?.completion_tokens)
      output += Number(m.metadata.completion_tokens);
  }
  return { input, output };
}

// ---------------------------------------------------------------------------
// Agent loop - runs tool calls until the model is done
// ---------------------------------------------------------------------------

async function agentLoop(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const messages = toMessages(dialogue);

    const response = await together.chat.completions.create({
      model: MODEL,
      max_tokens: 4096,
      tools,
      messages,
    });

    const choice = response.choices[0];
    const assistantMessage = choice?.message;

    if (!assistantMessage) {
      throw new Error("No message in response");
    }

    // Persist the assistant turn
    if (
      assistantMessage.tool_calls &&
      assistantMessage.tool_calls.length > 0
    ) {
      // Store the full assistant message shape so we can reconstruct it later
      await dialogue.saveMessage({
        role: "assistant",
        content: {
          role: "assistant",
          content: assistantMessage.content ?? "",
          tool_calls: assistantMessage.tool_calls,
        },
        metadata: {
          hasToolCalls: true,
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          completion_tokens: response.usage?.completion_tokens ?? 0,
        },
      });
    } else {
      await dialogue.saveMessage({
        role: "assistant",
        content: assistantMessage.content ?? "",
        metadata: {
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          completion_tokens: response.usage?.completion_tokens ?? 0,
        },
      });
    }

    // Done?
    if (choice.finish_reason === "stop" || choice.finish_reason === "eos") {
      return assistantMessage.content ?? "";
    }

    // Handle tool calls
    if (
      choice.finish_reason === "tool_calls" &&
      assistantMessage.tool_calls
    ) {
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        console.log(
          `   [tool] ${toolCall.function.name}(${JSON.stringify(args)})`
        );
        const result = executeTool(toolCall.function.name, args);
        console.log(`   [result] ${result}`);

        // Store tool result as the full message shape for reconstruction
        await dialogue.saveMessage({
          role: "tool",
          content: {
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Invocation 1 - Initial conversation with multi-tool use
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Multi-Tool Agent Loop ===\n");

  const dialogue = await db.createDialogue({
    label: "together-advanced-demo",
    state: {
      provider: "together",
      format: "openai-chat",
      model: MODEL,
      invocation: 1,
      started: new Date().toISOString(),
    },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  console.log("Sending query that requires multiple tools...\n");
  const reply = await agentLoop(
    dialogue,
    "I'm planning a trip. Check the weather in San Francisco and Tokyo, " +
      "convert both temperatures to Celsius, " +
      "and save a note summarizing the comparison."
  );
  console.log(`\nLlama: ${reply}\n`);

  await dialogue.saveState({
    provider: "together",
    format: "openai-chat",
    model: MODEL,
    invocation: 1,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  const { input, output } = sumTokens(dialogue);
  console.log("--- Invocation 1 Summary ---");
  console.log(`Dialogue ID: ${dialogue.id}`);
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(`Tokens used: ${input} input, ${output} output`);
  console.log("---\n");

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 - Cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  // Load conversation fresh from DialogueDB (simulates a new process)
  console.log(`Loading dialogue ${dialogueId} from scratch...`);
  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages\n`);

  const followUp =
    "Based on our earlier weather comparison, which city would be better " +
    "for outdoor activities this week? Also, what note did you save?";

  console.log("Sending follow-up with full prior context...\n");
  const reply = await agentLoop(dialogue, followUp);
  console.log(`\nLlama: ${reply}\n`);

  await dialogue.saveState({
    provider: "together",
    format: "openai-chat",
    model: MODEL,
    invocation: 2,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  const { input, output } = sumTokens(dialogue);
  console.log("--- Invocation 2 Summary ---");
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(`Tokens used: ${input} input, ${output} output`);
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
      `\nTo run invocation 2:\n  DIALOGUE_ID=${id} npm run advanced:2`
    );
  } else if (invocation === 2) {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId) {
      throw new Error("DIALOGUE_ID env var required for invocation 2");
    }
    await invocation2(dialogueId);
  } else {
    // Default: run both back-to-back
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
