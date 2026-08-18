/**
 * Advanced Example - DialogueDB + Google GenAI SDK (Gemini)
 *
 * Demonstrates the full integration:
 * - Manual function-calling loop with get_weather, calculate, save_note
 * - Every message persisted to DialogueDB, including function calls and responses
 * - Cold resume from a separate process invocation
 * - Token usage tracking in message metadata
 *
 * Usage:
 *   npm run advanced          # Run both invocations back-to-back
 *   npm run advanced:1        # Run only invocation 1 (prints dialogue ID)
 *   npm run advanced:2        # Run only invocation 2 (needs DIALOGUE_ID env)
 */

import { GoogleGenAI, type Content, type Part, type FunctionCall } from "@google/genai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { toolDeclarations, executeTool, buildFunctionResponsePart } from "./tools.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = new DialogueDB();
const MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to tools. Use them when needed to answer questions accurately. Be concise.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert DialogueDB messages to Gemini Content format.
 *
 * DialogueDB stores messages as { role, content, metadata }. For text
 * messages, content is a string. For function call/response messages,
 * content is the Gemini parts array so we can reconstruct the Content
 * object exactly.
 */
function toGeminiContents(dialogue: Dialogue): Content[] {
  const contents: Content[] = [];

  for (const m of dialogue.messages) {
    const geminiRole = m.role === "assistant" ? "model" : "user";

    if (
      m.metadata?.hasFunctionCalls === true ||
      m.metadata?.isFunctionResponse === true
    ) {
      // Structured content: we stored the parts array directly
      const parts: Part[] = Array.isArray(m.content) ? m.content : [];
      contents.push({ role: geminiRole, parts });
    } else {
      contents.push({ role: geminiRole, parts: [{ text: String(m.content) }] });
    }
  }

  return contents;
}

/** Sum token usage from message metadata across a dialogue. */
function sumTokens(dialogue: Dialogue) {
  let input = 0;
  let output = 0;
  for (const m of dialogue.messages) {
    if (m.metadata?.promptTokenCount)
      input += Number(m.metadata.promptTokenCount);
    if (m.metadata?.candidatesTokenCount)
      output += Number(m.metadata.candidatesTokenCount);
  }
  return { input, output };
}

// ---------------------------------------------------------------------------
// Agent loop - runs function calls until Gemini is done
// ---------------------------------------------------------------------------

async function agentLoop(
  dialogue: Dialogue,
  userMessage: string
): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const contents = toGeminiContents(dialogue);

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });

    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      // Model wants to call functions — persist the model's response parts
      const modelParts: Part[] = [];
      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        modelParts.push(...candidate.content.parts);
      }

      await dialogue.saveMessage({
        role: "assistant",
        content: modelParts,
        metadata: {
          hasFunctionCalls: true,
          promptTokenCount: response.usageMetadata?.promptTokenCount ?? 0,
          candidatesTokenCount:
            response.usageMetadata?.candidatesTokenCount ?? 0,
        },
      });

      // Execute each function and build response parts
      const responseParts: Part[] = [];
      for (const fc of functionCalls) {
        const name = fc.name ?? "unknown";
        const args = fc.args ?? {};
        console.log(`   [tool] ${name}(${JSON.stringify(args)})`);
        const result = executeTool(name, args);
        console.log(`   [result] ${JSON.stringify(result)}`);
        responseParts.push(
          buildFunctionResponsePart(name, fc.id ?? "", result)
        );
      }

      // Persist function responses as a user-role message
      await dialogue.saveMessage({
        role: "user",
        content: responseParts,
        metadata: { isFunctionResponse: true },
      });
    } else {
      // Text response — we're done
      const text = response.text ?? "";
      await dialogue.saveMessage({
        role: "assistant",
        content: text,
        metadata: {
          promptTokenCount: response.usageMetadata?.promptTokenCount ?? 0,
          candidatesTokenCount:
            response.usageMetadata?.candidatesTokenCount ?? 0,
        },
      });
      return text;
    }
  }
}

// ---------------------------------------------------------------------------
// Invocation 1 - Initial conversation with multi-tool use
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Multi-Tool Agent Loop ===\n");

  const dialogue = await db.createDialogue({
    label: "gemini-advanced-demo",
    state: {
      provider: "google",
      format: "gemini-content",
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
      "calculate the temperature difference, " +
      "and save a note summarizing the comparison."
  );
  console.log(`\nGemini: ${reply}\n`);

  await dialogue.saveState({
    provider: "google",
    format: "gemini-content",
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
  console.log(`\nGemini: ${reply}\n`);

  await dialogue.saveState({
    provider: "google",
    format: "gemini-content",
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
