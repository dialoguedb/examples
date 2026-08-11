/**
 * Advanced Example - DialogueDB + Cohere SDK (V2 Chat API)
 *
 * Demonstrates the full integration:
 * - Manual tool loop with get_weather, convert_temperature, save_note
 * - Every message persisted to DialogueDB, including tool calls and tool results
 * - Cold resume from a separate process invocation
 * - Token usage tracking in message metadata
 *
 * Usage:
 *   npm run advanced          # Run both invocations back-to-back
 *   npm run advanced:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run advanced:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import { CohereClientV2 } from "cohere-ai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { tools, executeTool } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const cohere = new CohereClientV2({});
const db = new DialogueDB();
const MODEL = "command-a-03-2025";

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

// ---------------------------------------------------------------------------
// Stored message shapes for DialogueDB content field
// ---------------------------------------------------------------------------

interface StoredToolCallMessage {
  role: "assistant";
  toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface StoredToolResultMessage {
  role: "tool";
  toolCallId: string;
  content: string;
}

function isToolCallMessage(
  content: unknown
): content is StoredToolCallMessage {
  return (
    typeof content === "object" &&
    content !== null &&
    "toolCalls" in content
  );
}

function isToolResultMessage(
  content: unknown
): content is StoredToolResultMessage {
  return (
    typeof content === "object" &&
    content !== null &&
    "toolCallId" in content
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CohereMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | {
      role: "assistant";
      toolCalls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; toolCallId: string; content: string };

/**
 * Convert DialogueDB messages to Cohere V2 format.
 *
 * DialogueDB stores messages as { role, content, metadata }. Cohere needs
 * specific shapes for assistant messages with tool_calls and tool-role
 * messages. We store the full message shape in content so we can
 * reconstruct it exactly.
 */
function toCohereMessages(dialogue: Dialogue): CohereMessage[] {
  const messages: CohereMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const m of dialogue.messages) {
    if (m.metadata?.hasToolCalls && isToolCallMessage(m.content)) {
      messages.push({
        role: "assistant",
        toolCalls: m.content.toolCalls,
      });
    } else if (m.role === "tool" && isToolResultMessage(m.content)) {
      messages.push({
        role: "tool",
        toolCallId: m.content.toolCallId,
        content: m.content.content,
      });
    } else if (m.role === "user") {
      const content =
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content);
      messages.push({ role: "user", content });
    } else if (m.role === "assistant") {
      const content =
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content);
      messages.push({ role: "assistant", content });
    }
  }

  return messages;
}

/** Extract text content from a Cohere chat response. */
function extractText(
  response: Awaited<ReturnType<typeof cohere.chat>>
): string {
  const blocks = response.message?.content;
  if (!blocks) return "";
  let text = "";
  for (const block of blocks) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text;
}

/** Sum token usage from message metadata across a dialogue. */
function sumTokens(dialogue: Dialogue) {
  let input = 0;
  let output = 0;
  for (const m of dialogue.messages) {
    if (m.metadata?.input_tokens) input += Number(m.metadata.input_tokens);
    if (m.metadata?.output_tokens)
      output += Number(m.metadata.output_tokens);
  }
  return { input, output };
}

// ---------------------------------------------------------------------------
// Agent loop - runs tool calls until Command is done
// ---------------------------------------------------------------------------

async function agentLoop(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const messages = toCohereMessages(dialogue);

    const response = await cohere.chat({
      model: MODEL,
      messages,
      tools,
    });

    const msg = response.message;
    const toolCalls = msg?.toolCalls;
    const inputTokens = response.usage?.tokens?.inputTokens ?? 0;
    const outputTokens = response.usage?.tokens?.outputTokens ?? 0;

    if (toolCalls && toolCalls.length > 0) {
      // Store assistant message with tool calls
      const storedToolCalls = toolCalls.map((tc) => ({
        id: tc.id ?? "",
        type: "function",
        function: {
          name: tc.function?.name ?? "",
          arguments: tc.function?.arguments ?? "{}",
        },
      }));

      await dialogue.saveMessage({
        role: "assistant",
        content: { role: "assistant", toolCalls: storedToolCalls },
        metadata: {
          hasToolCalls: true,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      });

      // Execute each tool and store results
      for (const tc of toolCalls) {
        const name = tc.function?.name ?? "";
        const args: Record<string, unknown> = JSON.parse(
          tc.function?.arguments ?? "{}"
        );
        console.log(`   [tool] ${name}(${JSON.stringify(args)})`);
        const result = executeTool(name, args);
        console.log(`   [result] ${result}`);

        await dialogue.saveMessage({
          role: "tool",
          content: {
            role: "tool",
            toolCallId: tc.id ?? "",
            content: result,
          },
        });
      }
    } else {
      // Final text response
      const text = extractText(response);
      await dialogue.saveMessage({
        role: "assistant",
        content: text,
        metadata: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      });

      if (
        response.finishReason === "COMPLETE" ||
        response.finishReason === "MAX_TOKENS" ||
        !toolCalls
      ) {
        return text;
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
    label: "cohere-advanced-demo",
    state: {
      provider: "cohere",
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
  console.log(`\nCommand: ${reply}\n`);

  await dialogue.saveState({
    provider: "cohere",
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
  console.log(`\nCommand: ${reply}\n`);

  await dialogue.saveState({
    provider: "cohere",
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
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
