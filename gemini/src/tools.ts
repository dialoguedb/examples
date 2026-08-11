/**
 * DialogueDB + Google Gemini: Function Calling with Cold Resume
 *
 * A multi-turn agent loop where Gemini calls tools to answer a question.
 * Every message — user text, model text, functionCall parts, and
 * functionResponse parts — is persisted to DialogueDB as a structured
 * `parts` array. A second invocation loads the dialogue fresh (simulating
 * a restart) and continues the conversation with full tool-call history
 * intact.
 *
 * Usage:
 *   npm run tools                           # runs both invocations back-to-back
 *   npm run tools -- --invocation=1         # only the first invocation
 *   DIALOGUE_ID=<id> npm run tools -- --invocation=2
 */

import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionDeclaration,
  type Part,
} from "@google/genai";
import { DialogueDB, setGlobalConfig, type Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
const db = new DialogueDB();
const MODEL = "gemini-2.0-flash";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const tools: FunctionDeclaration[] = [
  {
    name: "get_weather",
    description: "Get current weather for a city.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        city: { type: Type.STRING, description: "City name" },
      },
      required: ["city"],
    },
  },
  {
    name: "calculate",
    description: "Evaluate a simple arithmetic expression (numbers and + - * /).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        expression: { type: Type.STRING, description: "e.g. '12 * 4.5'" },
      },
      required: ["expression"],
    },
  },
];

/** Safely evaluate an arithmetic expression with no identifiers. */
function safeArithmetic(expression: string): number {
  if (!/^[\d+\-*/().\s]+$/.test(expression)) {
    throw new Error(`Invalid expression: ${expression}`);
  }
  // Tokenize and apply the shunting-yard algorithm — no eval, no Function.
  const tokens = expression.match(/\d+(?:\.\d+)?|[+\-*/()]/g) ?? [];
  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  for (const t of tokens) {
    if (/^\d/.test(t)) {
      out.push(parseFloat(t));
    } else if (t === "(") {
      ops.push(t);
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      if (ops.pop() !== "(") throw new Error("Mismatched parens");
    } else {
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        prec[ops[ops.length - 1]] >= prec[t]
      ) {
        out.push(ops.pop()!);
      }
      ops.push(t);
    }
  }
  while (ops.length) out.push(ops.pop()!);

  const stack: number[] = [];
  for (const t of out) {
    if (typeof t === "number") {
      stack.push(t);
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Bad expression");
      if (t === "+") stack.push(a + b);
      else if (t === "-") stack.push(a - b);
      else if (t === "*") stack.push(a * b);
      else if (t === "/") stack.push(a / b);
    }
  }
  if (stack.length !== 1) throw new Error("Bad expression");
  return stack[0];
}

/** Run a tool call. Returns a JSON-serializable response object. */
function runTool(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (name === "get_weather") {
    const city = String(args.city ?? "");
    // Fake deterministic weather so the example is self-contained.
    const temps: Record<string, number> = {
      Tokyo: 18,
      Paris: 14,
      "San Francisco": 16,
      London: 12,
    };
    return { city, temperatureC: temps[city] ?? 20, condition: "partly cloudy" };
  }
  if (name === "calculate") {
    const expression = String(args.expression ?? "");
    return { expression, result: safeArithmetic(expression) };
  }
  throw new Error(`Unknown tool: ${name}`);
}

// ---------------------------------------------------------------------------
// DialogueDB <-> Gemini conversion
//
// We store each message's content as the Gemini `parts` array directly
// (text, functionCall, functionResponse). DialogueDB accepts object/array
// content, so tool-call structure round-trips losslessly.
// ---------------------------------------------------------------------------

function toGeminiContents(dialogue: Dialogue): Content[] {
  return dialogue.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: m.content as Part[],
  }));
}

/** Extract a short summary of parts for console logging. */
function summarizeParts(parts: Part[]): string {
  return parts
    .map((p) => {
      if (p.text) return p.text.slice(0, 80);
      if (p.functionCall)
        return `[call ${p.functionCall.name}(${JSON.stringify(p.functionCall.args ?? {})})]`;
      if (p.functionResponse)
        return `[result ${p.functionResponse.name} -> ${JSON.stringify(p.functionResponse.response ?? {})}]`;
      return "[part]";
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

/** Run one turn: keep calling Gemini + executing tools until it stops. */
async function runAgentTurn(dialogue: Dialogue): Promise<void> {
  for (let step = 0; step < 8; step++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: toGeminiContents(dialogue),
      config: { tools: [{ functionDeclarations: tools }] },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    if (parts.length === 0) throw new Error("Empty response from Gemini");

    // Persist the model's turn (may contain text + functionCalls)
    await dialogue.saveMessage({
      role: "assistant",
      content: parts,
      metadata: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    });
    console.log(`  model: ${summarizeParts(parts)}`);

    // Collect any tool calls; if none, we're done with this turn.
    const calls = parts.filter((p): p is Part & { functionCall: NonNullable<Part["functionCall"]> } =>
      Boolean(p.functionCall)
    );
    if (calls.length === 0) return;

    // Execute tools and persist a single "user" turn with all functionResponse parts.
    const responseParts: Part[] = calls.map((p) => {
      const { name, args, id } = p.functionCall;
      const result = runTool(name ?? "", args ?? {});
      return {
        functionResponse: {
          id,
          name,
          response: result,
        },
      };
    });
    await dialogue.saveMessage({ role: "user", content: responseParts });
    console.log(`  tools: ${summarizeParts(responseParts)}`);
  }
  throw new Error("Agent loop exceeded max steps");
}

// ---------------------------------------------------------------------------
// Invocations
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: fresh agent with tools ===\n");

  const dialogue = await db.createDialogue({
    label: "gemini-tools-demo",
    state: { provider: "google", format: "gemini-parts", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  await dialogue.saveMessage({
    role: "user",
    content: [
      {
        text:
          "What's the weather in Tokyo and Paris right now, and what's the average of the two temperatures?",
      },
    ],
  });
  console.log(`  user: weather + average question`);

  await runAgentTurn(dialogue);

  console.log(`\nDialogue ID: ${dialogue.id}`);
  console.log(`Messages persisted: ${dialogue.messages.length}`);
  return dialogue.id;
}

async function invocation2(dialogueId: string): Promise<void> {
  console.log(`\n=== Invocation 2: cold resume of ${dialogueId} ===\n`);

  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);
  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages from DialogueDB\n`);

  await dialogue.saveMessage({
    role: "user",
    content: [
      {
        text:
          "Thanks. Now check London and tell me the total of all three cities' temperatures.",
      },
    ],
  });
  console.log(`  user: follow-up referencing prior tool results`);

  await runAgentTurn(dialogue);

  console.log(`\nFinal message count: ${dialogue.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogueId);
  console.log("Cleaned up. Done!");
}

async function main() {
  const invocationArg = process.argv.find((a) => a.startsWith("--invocation="));
  const invocation = invocationArg?.split("=")[1];

  if (invocation === "1") {
    const id = await invocation1();
    console.log(`\nTo continue: DIALOGUE_ID=${id} npm run tools -- --invocation=2`);
  } else if (invocation === "2") {
    const id = process.env.DIALOGUE_ID;
    if (!id) throw new Error("Set DIALOGUE_ID env var for --invocation=2");
    await invocation2(id);
  } else {
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
