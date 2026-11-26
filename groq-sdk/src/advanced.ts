/**
 * Advanced Example - DialogueDB + Groq SDK
 *
 * Demonstrates the full integration:
 * - Manual tool loop with get_weather, get_game_score, save_note
 * - Every message persisted to DialogueDB, including tool calls and tool results
 * - Cold resume from a separate process invocation
 * - Token usage tracking in message metadata
 *
 * Usage:
 *   npm run advanced          # Run both invocations back-to-back
 *   npm run advanced:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run advanced:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import Groq from "groq-sdk";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "groq-sdk/resources/chat/completions";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { tools, executeTool } from "./tools.js";
import { toGroqMessages } from "./format.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  // Defaults to https://api.dialoguedb.com when unset.
  ...(process.env.DIALOGUEDB_ENDPOINT
    ? { endpoint: process.env.DIALOGUEDB_ENDPOINT }
    : {}),
});

const groq = new Groq();
const db = new DialogueDB();
const MODEL = "llama-3.3-70b-versatile";

// Scope every read and write to one user's namespace. Two users running the
// same code never see each other's dialogues.
const NAMESPACE = process.env.DIALOGUEDB_NAMESPACE ?? "groq-demo-user";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract text from a Groq response. */
function extractText(response: ChatCompletion): string {
  return response.choices[0].message.content ?? "";
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
  // Save the initial user message
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const messages = toGroqMessages(dialogue);

    const response = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: 4096,
      tools,
      messages,
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // Persist the assistant turn with token usage
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Store the full assistant message shape so we can reconstruct it later
      await dialogue.saveMessage({
        role: "assistant",
        content: {
          role: "assistant",
          content: assistantMessage.content,
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

    // Only a tool_calls round continues the loop. Anything else (stop, length,
    // content_filter) must terminate, or the loop resends the same messages
    // forever.
    if (choice.finish_reason !== "tool_calls" || !assistantMessage.tool_calls) {
      return extractText(response);
    }

    for (const toolCall of assistantMessage.tool_calls) {
      // arguments is model-generated JSON; feed a parse failure back as the
      // tool result so the model can retry instead of crashing the run.
      let result: string;
      try {
        const args = JSON.parse(toolCall.function.arguments) as Record<
          string,
          unknown
        >;
        console.log(
          `   [tool] ${toolCall.function.name}(${JSON.stringify(args)})`
        );
        result = executeTool(toolCall.function.name, args);
      } catch {
        result = JSON.stringify({ error: "Malformed tool arguments" });
      }
      console.log(`   [result] ${result}`);

      // Store tool result as the full Groq tool message shape
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

// ---------------------------------------------------------------------------
// Invocation 1 - Initial conversation with multi-tool use
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Multi-Tool Agent Loop ===\n");

  const dialogue = await db.createDialogue({
    label: "groq-advanced-demo",
    namespace: NAMESPACE,
    state: {
      provider: "groq",
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
    "I'm heading to a Lakers game in Los Angeles this weekend. " +
      "Check the weather in LA, get the latest Lakers score, " +
      "and save a note with the game day plan."
  );
  console.log(`\nLlama: ${reply}\n`);

  // Persist agent state
  await dialogue.saveState({
    provider: "groq",
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
  const dialogue = await db.getDialogue(dialogueId, { namespace: NAMESPACE });
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages\n`);

  // New follow-up question
  const followUp =
    "Based on what we discussed, should I bring a jacket to the game? " +
    "Also, what was the Lakers' last score and what note did you save?";

  console.log("Sending follow-up with full prior context...\n");
  const reply = await agentLoop(dialogue, followUp);
  console.log(`\nLlama: ${reply}\n`);

  // Update state
  await dialogue.saveState({
    provider: "groq",
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
  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
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
