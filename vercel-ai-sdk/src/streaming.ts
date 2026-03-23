/**
 * Streaming — DialogueDB + Vercel AI SDK
 *
 * Shows how to use `streamText` with DialogueDB:
 * - Stream responses token-by-token using the Vercel AI SDK
 * - Persist the complete response after the stream finishes
 * - Cold restart and continue the streamed conversation
 *
 * This is the pattern you'd use in a Next.js or Express server
 * where you stream to the client but still want persistence.
 */

import { streamText, type CoreMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const model = anthropic("claude-sonnet-4-20250514");

/** Convert DialogueDB messages to CoreMessage format. */
function toCoreMessages(dialogue: Dialogue): CoreMessage[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

/**
 * Stream a response, printing tokens as they arrive.
 * Returns the full text once the stream completes.
 */
async function streamChat(messages: CoreMessage[]): Promise<{
  text: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const result = streamText({
    model,
    messages,
  });

  // Print tokens as they arrive
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  process.stdout.write("\n");

  // After the stream completes, get the final text and usage
  const text = await result.text;
  const usage = await result.usage;

  return {
    text,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  };
}

async function main() {
  console.log("=== DialogueDB + Vercel AI SDK: Streaming ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({ label: "vercel-ai-streaming" });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First exchange — stream the response
  await dialogue.saveMessage({
    role: "user",
    content:
      "Explain three key benefits of edge computing for real-time applications. Keep it concise.",
  });

  console.log("Exchange 1 (streaming) — Claude:");
  const reply1 = await streamChat(toCoreMessages(dialogue));

  // Persist the complete response after streaming finishes
  await dialogue.saveMessage({
    role: "assistant",
    content: reply1.text,
    metadata: {
      streamed: true,
      usage_input: reply1.promptTokens,
      usage_output: reply1.completionTokens,
    },
  });
  console.log(`  [${reply1.promptTokens} in, ${reply1.completionTokens} out]\n`);

  // 3. Second exchange — another streamed response
  await dialogue.saveMessage({
    role: "user",
    content:
      "Now give me a concrete example of each benefit you mentioned, using IoT sensors as the use case.",
  });

  console.log("Exchange 2 (streaming) — Claude:");
  const reply2 = await streamChat(toCoreMessages(dialogue));

  await dialogue.saveMessage({
    role: "assistant",
    content: reply2.text,
    metadata: {
      streamed: true,
      usage_input: reply2.promptTokens,
      usage_output: reply2.completionTokens,
    },
  });
  console.log(`  [${reply2.promptTokens} in, ${reply2.completionTokens} out]\n`);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Continue with another streamed response
  await resumed.saveMessage({
    role: "user",
    content:
      "Summarize our entire discussion so far in two bullet points.",
  });

  console.log("Exchange 3 (streaming, after restart) — Claude:");
  const reply3 = await streamChat(toCoreMessages(resumed));

  await resumed.saveMessage({
    role: "assistant",
    content: reply3.text,
    metadata: {
      streamed: true,
      usage_input: reply3.promptTokens,
      usage_output: reply3.completionTokens,
    },
  });
  console.log(`  [${reply3.promptTokens} in, ${reply3.completionTokens} out]\n`);

  // 6. Summary
  console.log(`Total messages persisted: ${resumed.messages.length}`);
  console.log(
    "Pattern: stream to client in real-time, persist to DialogueDB on completion."
  );

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
