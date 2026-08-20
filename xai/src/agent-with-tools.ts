/**
 * Agent with tools - DialogueDB + xAI (Grok)
 *
 * A tool-calling turn is the hard part of persistence. The protocol requires the
 * assistant's tool_calls and the matching tool results to come back in the next
 * request, exactly as they were issued, or the API rejects the conversation.
 * persist.ts stores the tool_calls as structured content so they round-trip.
 */

import OpenAI from "openai";
import { DialogueDB, type Dialogue } from "dialogue-db";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import "dotenv/config";
import { loadDialogue, toChatMessages, toStoredToolCallTurn } from "./persist.js";

const MODEL = "grok-4.20-0309-non-reasoning";
const NAMESPACE = "agent-with-tools";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const xai = new OpenAI({
  apiKey: requireEnv("XAI_API_KEY"),
  baseURL: "https://api.x.ai/v1",
});
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

const tools: ChatCompletionFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "get_deploy_status",
      description: "Get the deploy status for a service in a region",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Service name" },
          region: { type: "string", description: "AWS region" },
        },
        required: ["service", "region"],
      },
    },
  },
];

/** Stand-in for a real deploy API. */
function runTool(name: string, args: string): string {
  if (name !== "get_deploy_status") return `Unknown tool: ${name}`;
  const parsed: unknown = JSON.parse(args);
  const service =
    typeof parsed === "object" && parsed !== null && "service" in parsed
      ? String(parsed.service)
      : "unknown";
  return `${service}: healthy, last deploy 14 minutes ago`;
}

/** Run one turn, resolving any tool calls the model asks for. */
async function runTurn(dialogue: Dialogue, userText: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userText });

  const first = await xai.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: toChatMessages(dialogue),
    tools,
  });

  const message = first.choices[0]?.message;
  const toolCalls = message?.tool_calls ?? [];

  if (toolCalls.length === 0) {
    const reply = message?.content ?? "";
    await dialogue.saveMessage({ role: "assistant", content: reply });
    return reply;
  }

  // Keep the tool_calls verbatim: the next request has to replay them.
  await dialogue.saveMessage({
    role: "assistant",
    content: toStoredToolCallTurn(message?.content ?? null, toolCalls),
    metadata: { hasToolCalls: true },
  });

  for (const call of toolCalls) {
    if (call.type !== "function") continue;
    const result = runTool(call.function.name, call.function.arguments);
    await dialogue.saveMessage({
      role: "tool",
      content: result,
      metadata: { toolCallId: call.id },
    });
    console.log(`Tool ${call.function.name} -> ${result}`);
  }

  // Reload so the replayed conversation is exactly what was stored.
  const reloaded = await loadDialogue(db, dialogue.id, NAMESPACE);
  const second = await xai.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: toChatMessages(reloaded),
    tools,
  });
  const reply = second.choices[0]?.message.content ?? "";
  await dialogue.saveMessage({ role: "assistant", content: reply });
  return reply;
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Grok: Agent with Tools ===\n");

  const dialogueId = `xai-tools-${Date.now()}`;
  const dialogue = await loadDialogue(db, dialogueId, NAMESPACE);

  const first = await runTurn(dialogue, "Is the checkout service healthy in eu-west-2?");
  console.log(`Grok: ${first.trim()}\n`);

  // Cold restart: the stored tool_calls and tool results have to replay cleanly.
  console.log("--- simulating a cold restart ---\n");
  const cold = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const reloaded = await loadDialogue(cold, dialogueId, NAMESPACE);
  console.log(`Loaded ${reloaded.messages.length} messages, replaying the tool turn\n`);

  const second = await runTurn(reloaded, "Which service did I ask about?");
  console.log(`Grok: ${second.trim()}\n`);

  console.log(
    second.toLowerCase().includes("checkout")
      ? "Tool history survived the restart."
      : "Context was lost.",
  );

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log("Cleaned up the demo dialogue.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
