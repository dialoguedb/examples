/**
 * Streaming Example - DialogueDB + Ollama
 *
 * Local LLMs are slower to first-token than hosted APIs, so streaming is
 * essential for a good UX. This example shows how to:
 *
 * 1. Stream tokens from Ollama to the terminal as they arrive
 * 2. Accumulate the final message and persist it to DialogueDB in one write
 *    (once the stream completes) - we don't write every chunk, just the
 *    final assistant message.
 * 3. Capture per-message timing/token metadata from Ollama's final chunk
 *    and store it alongside the message.
 */

import { Ollama } from "ollama";
import type { Message as OllamaMessage } from "ollama";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
});
const db = new DialogueDB();
const MODEL = process.env.OLLAMA_MODEL || "llama3.2";

/** Convert DialogueDB messages to Ollama format. */
function toOllamaMessages(dialogue: Dialogue): OllamaMessage[] {
  return dialogue.messages.map((m) => ({
    role: m.role,
    content: m.content as string,
  }));
}

/**
 * Stream a chat response to stdout, then persist the completed message
 * with useful metadata (timing, token counts) attached.
 */
async function streamAndPersist(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  const stream = await ollama.chat({
    model: MODEL,
    messages: toOllamaMessages(dialogue),
    stream: true,
  });

  let full = "";
  let promptEvalCount = 0;
  let evalCount = 0;
  let totalDuration = 0;

  for await (const chunk of stream) {
    const token = chunk.message.content;
    if (token) {
      process.stdout.write(token);
      full += token;
    }
    if (chunk.done) {
      promptEvalCount = chunk.prompt_eval_count ?? 0;
      evalCount = chunk.eval_count ?? 0;
      totalDuration = chunk.total_duration ?? 0;
    }
  }
  process.stdout.write("\n");

  // One write to DialogueDB per assistant turn - metadata captures Ollama's
  // timing data (nanoseconds) and token counts so you can track local-model
  // performance across a conversation.
  await dialogue.saveMessage({
    role: "assistant",
    content: full,
    metadata: {
      prompt_eval_count: promptEvalCount,
      eval_count: evalCount,
      total_duration_ms: Math.round(totalDuration / 1_000_000),
    },
  });

  return full;
}

async function main() {
  console.log("=== DialogueDB + Ollama: Streaming ===\n");
  console.log(`Using model: ${MODEL}\n`);

  const dialogue = await db.createDialogue({
    label: "ollama-streaming",
    state: { provider: "ollama", model: MODEL, streaming: true },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  console.log("User: Explain vector embeddings in 3 short bullet points.\n");
  console.log("Assistant: ");
  await streamAndPersist(
    dialogue,
    "Explain vector embeddings in 3 short bullet points."
  );

  console.log("\nUser: Now give me one concrete example of where I'd use them.\n");
  console.log("Assistant: ");
  await streamAndPersist(
    dialogue,
    "Now give me one concrete example of where I'd use them."
  );

  // Report per-message timing captured in metadata
  console.log("\n--- Per-message stats ---");
  for (const m of dialogue.messages) {
    if (m.role !== "assistant") continue;
    const meta = m.metadata ?? {};
    const ms = meta.total_duration_ms ?? 0;
    const tokens = meta.eval_count ?? 0;
    const prompt = meta.prompt_eval_count ?? 0;
    console.log(
      `  ${m.id.slice(0, 8)}  prompt=${prompt} tok, out=${tokens} tok, ${ms}ms total`
    );
  }

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
