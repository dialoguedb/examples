/**
 * Advanced - tool calling and cross-SDK content
 *
 * Shows the two things that make persistence non-trivial with Bedrock:
 *
 * 1. A tool-calling turn produces toolUse / toolResult content blocks that must
 *    be stored as structured content so they round-trip unchanged.
 * 2. A dialogue can be written by another SDK. Content blocks stored by the
 *    Anthropic or OpenAI examples are not valid Bedrock blocks, so persist.ts
 *    normalizes them to text instead of letting the request fail.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ToolConfiguration,
  type ToolUseBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { requireEnv } from "./env.js";
import {
  loadDialogue,
  toBedrockMessages,
  toContentBlocks,
  toSystemPrompt,
} from "./persist.js";

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-sonnet-4-20250514-v1:0";
const NAMESPACE = "advanced";

const bedrock = new BedrockRuntimeClient();
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

const TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: "get_weather",
        description: "Get the current temperature for a city",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name" },
            },
            required: ["city"],
          },
        },
      },
    },
  ],
};

function lookupWeather(city: string): string {
  return `18°C and overcast in ${city}`;
}

function toToolInput(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  const input: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) input[key] = entry;
  return input;
}

function extractText(content: ContentBlock[]): string {
  return content
    .map((block) => block.text)
    .filter((text): text is string => text !== undefined)
    .join("");
}

async function toolCallingTurn(
  dialogueId: string,
  input: string,
): Promise<void> {
  const dialogue = await loadDialogue(db, dialogueId, NAMESPACE);
  await dialogue.saveMessage({ role: "user", content: input });

  const response = await bedrock.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: toSystemPrompt(dialogue),
      messages: toBedrockMessages(dialogue),
      toolConfig: TOOL_CONFIG,
      inferenceConfig: { maxTokens: 1024 },
    }),
  );

  const content = response.output?.message?.content;
  if (!content) throw new Error("No response from Bedrock");

  if (response.stopReason !== "tool_use") {
    const text = extractText(content);
    await dialogue.saveMessage({ role: "assistant", content: text });
    console.log(`Bedrock answered without calling a tool: ${text.trim()}`);
    return;
  }

  // The model's turn includes toolUse blocks. Store the full content array so
  // the structured blocks survive a reload.
  await dialogue.saveMessage({ role: "assistant", content });

  const toolUseBlocks = content
    .map((block) => block.toolUse)
    .filter((tu): tu is ToolUseBlock => tu !== undefined);

  const resultBlocks: ContentBlock[] = toolUseBlocks.map((toolUse) => {
    const args = toToolInput(toolUse.input);
    const name = toolUse.name ?? "unknown";
    console.log(`Tool called: ${name}(${JSON.stringify(args)})`);
    const result = lookupWeather(String(args.city ?? "unknown"));
    console.log(`Result: ${result}`);
    return {
      toolResult: {
        toolUseId: toolUse.toolUseId,
        content: [{ text: result }],
        status: "success",
      },
    };
  });

  await dialogue.saveMessage({ role: "user", content: resultBlocks });

  // Reload the full history and get the final answer
  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  const finalResponse = await bedrock.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: toSystemPrompt(reloaded),
      messages: toBedrockMessages(reloaded),
      toolConfig: TOOL_CONFIG,
      inferenceConfig: { maxTokens: 1024 },
    }),
  );

  const finalContent = finalResponse.output?.message?.content;
  if (!finalContent) throw new Error("No final response from Bedrock");

  const answer = extractText(finalContent);
  await reloaded.saveMessage({ role: "assistant", content: answer });
  console.log(`Bedrock: ${answer.trim()}`);
}

async function crossSdkTurn(dialogueId: string): Promise<void> {
  const dialogue = await loadDialogue(db, dialogueId, NAMESPACE);

  // Exactly what the Anthropic examples persist: an array of typed content blocks.
  // persist.ts normalizes these to text for Bedrock.
  await dialogue.saveMessage({
    role: "assistant",
    content: [
      { type: "text", text: "I checked the deploy log earlier." },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "read_log",
        input: { path: "/var/log/deploy" },
      },
    ],
  });
  await dialogue.saveMessage({
    role: "user",
    content: "In one sentence, what did you check?",
  });

  const reloaded = await loadDialogue(db, dialogueId, NAMESPACE);
  const response = await bedrock.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: toBedrockMessages(reloaded),
      inferenceConfig: { maxTokens: 200 },
    }),
  );

  const content = response.output?.message?.content;
  if (!content) throw new Error("No response from Bedrock");

  const answer = extractText(content);
  await reloaded.saveMessage({ role: "assistant", content: answer });
  console.log(`Bedrock read the foreign blocks: ${answer.trim()}`);
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Amazon Bedrock: Advanced ===\n");

  const toolDialogueId = `bedrock-tools-${Date.now()}`;
  console.log("-- tool calling (Converse API) --");
  await toolCallingTurn(toolDialogueId, "What's the weather in Lisbon?");
  await db.deleteDialogue(toolDialogueId, { namespace: NAMESPACE });

  const crossDialogueId = `bedrock-cross-sdk-${Date.now()}`;
  console.log("\n-- content written by another SDK --");
  await crossSdkTurn(crossDialogueId);
  await db.deleteDialogue(crossDialogueId, { namespace: NAMESPACE });

  console.log("\nCleaned up both demo dialogues.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
