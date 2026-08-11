/**
 * Tool Use Example - DialogueDB + Mistral SDK
 *
 * Demonstrates the full integration:
 * - Tool loop with get_weather, convert_temperature, save_note
 * - Every message persisted to DialogueDB, including tool calls and tool results
 * - Cold resume from a separate process invocation
 * - Token usage tracking in message metadata
 *
 * Usage:
 *   npm run tool-use          # Run both invocations back-to-back
 *   npm run tool-use:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run tool-use:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import { Mistral } from "@mistralai/mistralai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import type { Messages } from "@mistralai/mistralai/models/components/chatcompletionrequest.js";
import type { AssistantMessage } from "@mistralai/mistralai/models/components/assistantmessage.js";
import { tools, executeTool } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });
const db = new DialogueDB();
const MODEL = "mistral-small-latest";

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert DialogueDB messages to Mistral format.
 *
 * DialogueDB stores messages as { role, content, metadata }. Mistral's API
 * needs specific shapes for assistant messages with toolCalls and for
 * tool-role messages. We store the full Mistral message shape in content
 * so we can reconstruct it exactly.
 */
function toMistralMessages(dialogue: Dialogue): Messages[] {
  const messages: Messages[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const m of dialogue.messages) {
    // Messages with tool calls are stored as their full Mistral shape
    if (m.metadata?.hasToolCalls) {
      const stored = m.content as {
        role: "assistant";
        content: string | null;
        toolCalls: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
      messages.push({
        role: "assistant",
        content: stored.content ?? "",
        toolCalls: stored.toolCalls,
      });
    } else if (m.role === "tool") {
      const stored = m.content as {
        role: "tool";
        content: string;
        toolCallId: string;
        name: string;
      };
      messages.push({
        role: "tool",
        content: stored.content,
        toolCallId: stored.toolCallId,
        name: stored.name,
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

/** Sum token usage from message metadata across a dialogue. */
function sumTokens(dialogue: Dialogue) {
  let input = 0;
  let output = 0;
  for (const m of dialogue.messages) {
    if (m.metadata?.promptTokens) input += Number(m.metadata.promptTokens);
    if (m.metadata?.completionTokens)
      output += Number(m.metadata.completionTokens);
  }
  return { input, output };
}

// ---------------------------------------------------------------------------
// Agent loop - runs tool calls until Mistral is done
// ---------------------------------------------------------------------------

async function agentLoop(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  // Save the initial user message
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const messages = toMistralMessages(dialogue);

    const response = await mistral.chat.complete({
      model: MODEL,
      maxTokens: 4096,
      tools,
      messages,
    });

    const choice = response.choices?.[0];
    if (!choice) throw new Error("No response choice from Mistral");
    const assistantMessage: AssistantMessage = choice.message;

    // Persist the assistant turn with token usage
    if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
      // Store the full assistant message shape for reconstruction on resume
      await dialogue.saveMessage({
        role: "assistant",
        content: {
          role: "assistant",
          content: assistantMessage.content?.toString() ?? null,
          toolCalls: assistantMessage.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type ?? "function",
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
            },
          })),
        },
        metadata: {
          hasToolCalls: true,
          promptTokens: response.usage?.promptTokens ?? 0,
          completionTokens: response.usage?.completionTokens ?? 0,
        },
      });
    } else {
      await dialogue.saveMessage({
        role: "assistant",
        content: assistantMessage.content?.toString() ?? "",
        metadata: {
          promptTokens: response.usage?.promptTokens ?? 0,
          completionTokens: response.usage?.completionTokens ?? 0,
        },
      });
    }

    // Done?
    if (choice.finishReason === "stop") {
      return assistantMessage.content?.toString() ?? "";
    }

    // Handle tool calls
    if (
      choice.finishReason === "tool_calls" &&
      assistantMessage.toolCalls
    ) {
      for (const toolCall of assistantMessage.toolCalls) {
        const args =
          typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
        console.log(
          `   [tool] ${toolCall.function.name}(${JSON.stringify(args)})`
        );
        const result = executeTool(toolCall.function.name, args);
        console.log(`   [result] ${result}`);

        // Store tool result as the full Mistral tool message shape
        await dialogue.saveMessage({
          role: "tool",
          content: {
            role: "tool",
            toolCallId: toolCall.id ?? "",
            name: toolCall.function.name,
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
    label: "mistral-tool-use-demo",
    state: {
      provider: "mistral",
      format: "mistral-chat",
      model: MODEL,
      invocation: 1,
      started: new Date().toISOString(),
    },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  console.log("Sending query that requires multiple tools...\n");
  const reply = await agentLoop(
    dialogue,
    "I'm planning a trip. Check the weather in Paris and Tokyo, " +
      "convert both temperatures to Celsius, " +
      "and save a note summarizing the comparison."
  );
  console.log(`\nMistral: ${reply}\n`);

  await dialogue.saveState({
    provider: "mistral",
    format: "mistral-chat",
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
  console.log(`\nMistral: ${reply}\n`);

  await dialogue.saveState({
    provider: "mistral",
    format: "mistral-chat",
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
      `\nTo run invocation 2:\n  DIALOGUE_ID=${id} npm run tool-use:2`
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
