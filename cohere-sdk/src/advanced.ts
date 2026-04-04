/**
 * Advanced Example - DialogueDB + Cohere SDK (v2 Chat API)
 *
 * Demonstrates the full integration:
 * - Manual tool loop with get_weather, calculate, save_note
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
import type { Cohere } from "cohere-ai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { tools, executeTool } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const cohere = new CohereClientV2({
  token: process.env.COHERE_API_KEY!,
});
const db = new DialogueDB();
const MODEL = "command-a-03-2025";

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert DialogueDB messages to Cohere v2 format.
 *
 * DialogueDB stores messages as { role, content, metadata }. Cohere's v2 API
 * needs specific shapes for assistant messages with tool_calls and for
 * tool-role messages. We store the full Cohere message shape in content
 * so we can reconstruct it exactly.
 */
function toCohereMessages(dialogue: Dialogue): Cohere.ChatMessageV2[] {
  const messages: Cohere.ChatMessageV2[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const m of dialogue.messages) {
    if (m.metadata?.hasToolCalls) {
      // Assistant messages with tool calls are stored as objects
      const stored = m.content as {
        toolCalls: Cohere.ToolCallV2[];
        toolPlan?: string;
        content?: Cohere.AssistantMessageV2Content;
      };
      messages.push({
        role: "assistant",
        toolCalls: stored.toolCalls,
        toolPlan: stored.toolPlan,
        content: stored.content,
      });
    } else if (m.role === "tool") {
      // Tool results are stored as objects with toolCallId and content
      const stored = m.content as { toolCallId: string; content: string };
      messages.push({
        role: "tool",
        toolCallId: stored.toolCallId,
        content: stored.content,
      });
    } else {
      messages.push({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      });
    }
  }

  return messages;
}

/** Extract text from a Cohere v2 chat response. */
function extractText(response: Cohere.V2ChatResponse): string {
  const firstBlock = response.message?.content?.[0];
  if (firstBlock && firstBlock.type === "text") {
    return firstBlock.text;
  }
  return "";
}

/** Sum token usage from message metadata across a dialogue. */
function sumTokens(dialogue: Dialogue) {
  let input = 0;
  let output = 0;
  for (const m of dialogue.messages) {
    if (m.metadata?.input_tokens) input += Number(m.metadata.input_tokens);
    if (m.metadata?.output_tokens) output += Number(m.metadata.output_tokens);
  }
  return { input, output };
}

// ---------------------------------------------------------------------------
// Agent loop - runs tool calls until Cohere is done
// ---------------------------------------------------------------------------

async function agentLoop(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  // Save the initial user message
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const messages = toCohereMessages(dialogue);

    const response = await cohere.chat({
      model: MODEL,
      messages,
      tools,
    });

    const assistantMessage = response.message;

    // Persist the assistant turn with token usage
    if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
      // Store the full assistant message shape so we can reconstruct it later
      await dialogue.saveMessage({
        role: "assistant",
        content: {
          toolCalls: assistantMessage.toolCalls,
          toolPlan: assistantMessage.toolPlan,
          content: assistantMessage.content,
        },
        metadata: {
          hasToolCalls: true,
          input_tokens: response.usage?.tokens?.inputTokens ?? 0,
          output_tokens: response.usage?.tokens?.outputTokens ?? 0,
        },
      });
    } else {
      await dialogue.saveMessage({
        role: "assistant",
        content: extractText(response),
        metadata: {
          input_tokens: response.usage?.tokens?.inputTokens ?? 0,
          output_tokens: response.usage?.tokens?.outputTokens ?? 0,
        },
      });
    }

    // Done - no tool calls
    if (
      !assistantMessage.toolCalls ||
      assistantMessage.toolCalls.length === 0
    ) {
      return extractText(response);
    }

    // Handle tool calls
    for (const toolCall of assistantMessage.toolCalls) {
      const fnName = toolCall.function?.name ?? "unknown";
      const args = JSON.parse(toolCall.function?.arguments ?? "{}") as Record<
        string,
        unknown
      >;
      console.log(`   [tool] ${fnName}(${JSON.stringify(args)})`);
      const result = executeTool(fnName, args);
      console.log(`   [result] ${result}`);

      // Store tool result as the full Cohere tool message shape
      await dialogue.saveMessage({
        role: "tool",
        content: {
          toolCallId: toolCall.id,
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
    label: "cohere-advanced-demo",
    state: {
      provider: "cohere",
      format: "cohere-v2-chat",
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
      "calculate the temperature difference in Fahrenheit, " +
      "and save a note summarizing the comparison."
  );
  console.log(`\nCommand R+: ${reply}\n`);

  // Persist agent state
  await dialogue.saveState({
    provider: "cohere",
    format: "cohere-v2-chat",
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

  // New follow-up question
  const followUp =
    "Based on our earlier weather comparison, which city would be better " +
    "for outdoor activities this week? Also, what note did you save?";

  console.log("Sending follow-up with full prior context...\n");
  const reply = await agentLoop(dialogue, followUp);
  console.log(`\nCommand R+: ${reply}\n`);

  // Update state
  await dialogue.saveState({
    provider: "cohere",
    format: "cohere-v2-chat",
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
