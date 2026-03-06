/**
 * Advanced Example - DialogueDB + Claude API (Messages API)
 *
 * Demonstrates the full integration:
 * - Manual tool loop with get_weather, calculate, save_note
 * - Every message persisted to DialogueDB, including tool_use and tool_result blocks
 * - Cold resume from a separate process invocation
 * - Prompt caching for efficient context restoration
 * - Token usage tracking in message metadata
 *
 * Usage:
 *   npm run advanced          # Run both invocations back-to-back
 *   npm run advanced:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run advanced:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import Anthropic from "@anthropic-ai/sdk";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { tools, executeTool } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const anthropic = new Anthropic();
const db = new DialogueDB();
const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnthropicMessage = Anthropic.MessageParam;

/** Convert DialogueDB messages to Anthropic API format. */
function toAnthropicMessages(dialogue: Dialogue): AnthropicMessage[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as Anthropic.MessageParam["content"],
  }));
}

/**
 * Convert messages with a prompt-cache hint on the last message of the
 * existing conversation prefix (everything before the new user turn).
 */
function toAnthropicMessagesWithCache(
  dialogue: Dialogue
): AnthropicMessage[] {
  const messages = toAnthropicMessages(dialogue);

  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    if (typeof last.content === "string") {
      last.content = [
        {
          type: "text",
          text: last.content,
          cache_control: { type: "ephemeral" },
        },
      ];
    } else if (Array.isArray(last.content)) {
      const lastBlock = last.content[last.content.length - 1] as unknown as {
        cache_control?: { type: string };
      };
      lastBlock.cache_control = { type: "ephemeral" };
    }
  }

  return messages;
}

/** Extract text from an Anthropic response. */
function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
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
// Agent loop - runs tool calls until Claude is done
// ---------------------------------------------------------------------------

async function agentLoop(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  // Save the initial user message
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const messages = toAnthropicMessages(dialogue);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Persist the assistant turn with token usage
    await dialogue.saveMessage({
      role: "assistant",
      content: response.content as Anthropic.MessageParam["content"],
      metadata: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });

    // Done?
    if (response.stop_reason === "end_turn") {
      return extractText(response);
    }

    // Handle tool calls
    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = toolBlocks.map(
        (block) => {
          console.log(
            `   [tool] ${block.name}(${JSON.stringify(block.input)})`
          );
          const result = executeTool(
            block.name,
            block.input as Record<string, unknown>
          );
          console.log(`   [result] ${result}`);
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result,
          };
        }
      );

      // Persist tool results as a user message
      await dialogue.saveMessage({
        role: "user",
        content: toolResults as Anthropic.MessageParam["content"],
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
    label: "advanced-demo",
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
  console.log(`\nClaude: ${reply}\n`);

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
  console.log(`Tokens used: ${input} input, ${output} output`);
  console.log("---\n");

  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 - Cold resume with prompt caching
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume with Prompt Caching ===\n");

  // Load conversation fresh from DialogueDB (simulates a new Lambda / process)
  console.log(`Loading dialogue ${dialogueId} from scratch...`);
  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);

  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages\n`);

  // Build messages with cache hints on the conversation prefix
  const cachedMessages = toAnthropicMessagesWithCache(dialogue);

  // New follow-up question
  const followUp =
    "Based on our earlier weather comparison, which city would be better " +
    "for outdoor activities this week? Also, what note did you save?";

  await dialogue.saveMessage({ role: "user", content: followUp });
  cachedMessages.push({ role: "user", content: followUp });

  console.log("Sending follow-up with cached context...\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools,
    messages: cachedMessages,
  });

  const replyText = extractText(response);

  await dialogue.saveMessage({
    role: "assistant",
    content: response.content as Anthropic.MessageParam["content"],
    metadata: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens:
        (response.usage as unknown as Record<string, number>)
          .cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:
        (response.usage as unknown as Record<string, number>)
          .cache_read_input_tokens ?? 0,
    },
  });

  console.log(`Claude: ${replyText}\n`);

  // Update state
  await dialogue.saveState({
    invocation: 2,
    completed: true,
    totalMessages: dialogue.messages.length,
  });

  const cacheUsage = response.usage as unknown as Record<string, number>;
  console.log("--- Invocation 2 Summary ---");
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  console.log(
    `Cache creation tokens: ${cacheUsage.cache_creation_input_tokens ?? 0}`
  );
  console.log(
    `Cache read tokens: ${cacheUsage.cache_read_input_tokens ?? 0}`
  );
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
