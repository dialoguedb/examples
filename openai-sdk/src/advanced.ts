/**
 * Advanced Example - DialogueDB + OpenAI SDK
 *
 * Demonstrates the full integration:
 * - Tool-calling loop with get_weather, calculate, save_note
 * - Every message persisted to DialogueDB, including tool calls and results
 * - Cold resume from a separate process invocation
 * - Token usage tracking in message metadata
 *
 * Usage:
 *   npm run advanced          # Run both invocations back-to-back
 *   npm run advanced:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run advanced:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { tools, executeTool } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert DialogueDB messages to OpenAI format.
 *
 * DialogueDB stores each message with a role and content. For OpenAI tool
 * calls, we store the full OpenAI message object as the content so we can
 * reconstruct the exact shape on reload.
 */
function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const m of dialogue.messages) {
    // If content is an object with an _openai_msg key, it's a stored OpenAI message
    if (
      m.content &&
      typeof m.content === "object" &&
      "_openai_msg" in (m.content as Record<string, unknown>)
    ) {
      messages.push(
        (m.content as Record<string, unknown>)
          ._openai_msg as OpenAI.ChatCompletionMessageParam
      );
    } else {
      messages.push({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      });
    }
  }

  return messages;
}

/** Extract text from an OpenAI response message. */
function extractText(
  message: OpenAI.ChatCompletionMessage
): string {
  return message.content ?? "";
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
// Agent loop - runs tool calls until GPT is done
// ---------------------------------------------------------------------------

async function agentLoop(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  // Save the initial user message
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const messages = toOpenAIMessages(dialogue);

    const response = await openai.chat.completions.create({
      model: MODEL,
      tools,
      messages,
    });

    const choice = response.choices[0];
    const assistantMsg = choice.message;

    // Persist the assistant turn — store the full OpenAI message object
    // so tool_calls are preserved for reconstruction on cold resume
    await dialogue.saveMessage({
      role: "assistant",
      content: { _openai_msg: assistantMsg },
      metadata: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
      },
    });

    // Done?
    if (choice.finish_reason === "stop") {
      return extractText(assistantMsg);
    }

    // Handle tool calls
    if (choice.finish_reason === "tool_calls" && assistantMsg.tool_calls) {
      for (const toolCall of assistantMsg.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        console.log(
          `   [tool] ${toolCall.function.name}(${JSON.stringify(args)})`
        );
        const result = executeTool(toolCall.function.name, args);
        console.log(`   [result] ${result}`);

        // Each tool result is a separate message in OpenAI's format
        const toolMsg: OpenAI.ChatCompletionToolMessageParam = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        };

        // Persist tool result — wrap in _openai_msg so we can reconstruct it
        await dialogue.saveMessage({
          role: "user",
          content: { _openai_msg: toolMsg },
          metadata: {
            event: "tool_result",
            toolName: toolCall.function.name,
            tool_call_id: toolCall.id,
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
    label: "advanced-openai-demo",
    state: { invocation: 1, started: new Date().toISOString() },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  console.log("Sending query that requires multiple tools...\n");
  const reply = await agentLoop(
    dialogue,
    "I'm planning a trip. Check the weather in San Francisco and Tokyo, " +
      "calculate the temperature difference in Celsius, " +
      "and save a note summarizing the comparison."
  );
  console.log(`\nGPT: ${reply}\n`);

  // Persist agent state
  await dialogue.saveState({
    invocation: 1,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  const { input, output } = sumTokens(dialogue);
  console.log("--- Invocation 1 Summary ---");
  console.log(`Dialogue ID: ${dialogue.id}`);
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(`Tokens used: ${input} prompt, ${output} completion`);
  console.log("---\n");

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 - Cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  // Load conversation fresh from DialogueDB (simulates a new process / Lambda)
  console.log(`Loading dialogue ${dialogueId} from scratch...`);
  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages\n`);

  // New follow-up question — GPT gets full conversation context from DialogueDB
  const followUp =
    "Based on our earlier weather comparison, which city would be better " +
    "for outdoor activities this week? Also, what note did you save?";

  await dialogue.saveMessage({ role: "user", content: followUp });

  const messages = toOpenAIMessages(dialogue);

  console.log("Sending follow-up with full context from DialogueDB...\n");

  const response = await openai.chat.completions.create({
    model: MODEL,
    tools,
    messages,
  });

  const replyText = extractText(response.choices[0].message);

  await dialogue.saveMessage({
    role: "assistant",
    content: { _openai_msg: response.choices[0].message },
    metadata: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
    },
  });

  console.log(`GPT: ${replyText}\n`);

  // Update state
  await dialogue.saveState({
    invocation: 2,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  const { input, output } = sumTokens(dialogue);
  console.log("--- Invocation 2 Summary ---");
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(`Tokens used (cumulative): ${input} prompt, ${output} completion`);
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
