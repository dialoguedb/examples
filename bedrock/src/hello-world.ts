/**
 * Hello World - DialogueDB + Amazon Bedrock
 *
 * The simplest proof of concept:
 * 1. Create a conversation in DialogueDB
 * 2. Chat with any Bedrock model via the Converse API
 * 3. Simulate a cold restart - load the conversation fresh
 * 4. Continue chatting - the model has full context from before the restart
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Message, ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});
const db = new DialogueDB();

// Any Bedrock-supported model: Claude, Llama, Mistral, Titan, etc.
const MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";

/** Extract text from Bedrock ContentBlock array. */
function extractText(content: ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of content) {
    if ("text" in block && block.text) {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

/** Send messages to Bedrock via the Converse API, return the text response. */
async function chat(messages: Message[]): Promise<string> {
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages,
    inferenceConfig: { maxTokens: 1024 },
  });
  const response = await client.send(command);

  const outputContent = response.output?.message?.content;
  if (!outputContent) throw new Error("No response from Bedrock");
  return extractText(outputContent);
}

/** Convert DialogueDB messages to Bedrock Converse API format. */
function toBedrockMessages(dialogue: Dialogue): Message[] {
  return dialogue.messages.map((m) => {
    if (m.role !== "user" && m.role !== "assistant") {
      throw new Error(`Unexpected role: ${m.role}`);
    }
    const text =
      typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content);
    return { role: m.role, content: [{ text }] };
  });
}

async function main() {
  console.log("=== DialogueDB + Amazon Bedrock: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "bedrock-hello-world",
    state: { provider: "bedrock", model: MODEL_ID },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange - establish some memorable context
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! My name is Jordan and I'm building a multi-tenant SaaS platform " +
      "on AWS. I need help designing the authentication and authorization " +
      "layer. What approach would you suggest?",
  });
  const reply1 = await chat(toBedrockMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply1 });
  console.log(`Exchange 1: ${reply1.slice(0, 150)}...\n`);

  // 3. Follow-up in the same session
  await dialogue.saveMessage({
    role: "user",
    content:
      "Good ideas. I also need row-level security for the database layer " +
      "and want to use Cognito for identity. How would those fit into the " +
      "architecture?",
  });
  const reply2 = await chat(toBedrockMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply2 });
  console.log(`Exchange 2: ${reply2.slice(0, 150)}...\n`);

  // 4. COLD RESTART - load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue the conversation - the model should have full context
  await resumed.saveMessage({
    role: "user",
    content:
      "Quick recap: what's my name, what am I building, and what specific " +
      "AWS services did we discuss?",
  });
  const reply3 = await chat(toBedrockMessages(resumed));
  await resumed.saveMessage({ role: "assistant", content: reply3 });
  console.log(`Exchange 3 (after restart):\n${reply3}\n`);

  // 6. Verify context was preserved
  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("jordan") &&
    (lower.includes("saas") ||
      lower.includes("multi-tenant") ||
      lower.includes("cognito"));
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );
  console.log(`Total messages persisted: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
