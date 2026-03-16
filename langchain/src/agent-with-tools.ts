/**
 * Agent with Tools — DialogueDB + LangChain
 *
 * Shows how to use DialogueDB as persistent memory for a LangChain tool-calling agent:
 * 1. Create an agent with tools (web search, calculator)
 * 2. Run a multi-step query — all messages and tool calls persisted
 * 3. Cold restart — load the conversation fresh
 * 4. Ask a follow-up that references earlier tool results
 *
 * This demonstrates that DialogueDB preserves the full agent interaction history,
 * including tool calls and results, across process boundaries.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { setGlobalConfig, DialogueDB } from "dialogue-db";
import { DialogueChatHistory } from "./lib/dialogue-history.js";
import "dotenv/config";

// -- DialogueDB setup --
setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const MODEL = process.env.MODEL ?? "claude-sonnet-4-20250514";
const db = new DialogueDB();

// -- Mock tools (replace with real implementations) --

const weatherTool = tool(
  async ({ location }) => {
    const data: Record<string, string> = {
      "san francisco": "62°F, Sunny, Wind: 12mph NW",
      "new york": "45°F, Cloudy, Wind: 8mph E",
      tokyo: "58°F, Partly cloudy, Wind: 5mph S",
      london: "50°F, Rainy, Wind: 15mph W",
    };
    return data[location.toLowerCase()] ?? `${location}: 70°F, Clear`;
  },
  {
    name: "get_weather",
    description: "Get current weather conditions for a city",
    schema: z.object({
      location: z.string().describe("City name"),
    }),
  }
);

const calculatorTool = tool(
  async ({ expression }) => {
    try {
      const result = Function(`"use strict"; return (${expression})`)();
      return `${expression} = ${result}`;
    } catch {
      return `Could not evaluate: ${expression}`;
    }
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression",
    schema: z.object({
      expression: z.string().describe("Math expression, e.g. '(72 - 58) * 5/9'"),
    }),
  }
);

const tools = [weatherTool, calculatorTool];

/** Create an agent executor wired to a DialogueChatHistory. */
function createAgent(history: DialogueChatHistory) {
  const llm = new ChatAnthropic({ model: MODEL, maxTokens: 4096 });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant with access to tools. Be concise."],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const agent = createToolCallingAgent({ llm, tools, prompt });

  return new AgentExecutor({
    agent,
    tools,
    // We persist via DialogueChatHistory, not AgentExecutor's built-in memory
  }).withConfig({});
}

// ---------------------------------------------------------------------------
// Invocation 1 — multi-tool query
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Agent with Tools ===\n");

  const history = new DialogueChatHistory({ label: "langchain-agent-demo" });
  const executor = createAgent(history);

  // First query — triggers multiple tool calls
  const input1 =
    "Compare the weather in San Francisco and Tokyo. " +
    "Calculate the temperature difference in Celsius.";

  console.log(`User: ${input1}\n`);

  // Get chat history for context
  const chatHistory = await history.getMessages();
  const result1 = await executor.invoke({ input: input1, chat_history: chatHistory });

  // Persist the exchange to DialogueDB
  await history.addMessage(new (await import("@langchain/core/messages")).HumanMessage(input1));
  await history.addMessage(
    new (await import("@langchain/core/messages")).AIMessage(result1.output as string)
  );

  console.log(`Claude: ${result1.output}\n`);

  // Second query — builds on the first
  const input2 = "Based on that comparison, which city is better for an outdoor picnic today?";
  console.log(`User: ${input2}\n`);

  const chatHistory2 = await history.getMessages();
  const result2 = await executor.invoke({ input: input2, chat_history: chatHistory2 });

  await history.addMessage(new (await import("@langchain/core/messages")).HumanMessage(input2));
  await history.addMessage(
    new (await import("@langchain/core/messages")).AIMessage(result2.output as string)
  );

  console.log(`Claude: ${result2.output}\n`);

  const dialogueId = history.getDialogueId()!;
  console.log(`--- Invocation 1 done. Dialogue ID: ${dialogueId} ---\n`);
  return dialogueId;
}

// ---------------------------------------------------------------------------
// Invocation 2 — cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  // Fresh history pointing at the same DialogueDB dialogue
  const history = new DialogueChatHistory({ dialogueId });
  const executor = createAgent(history);

  // Load persisted messages
  const chatHistory = await history.getMessages();
  console.log(`Loaded ${chatHistory.length} messages from DialogueDB\n`);

  // Follow-up that requires context from invocation 1
  const input =
    "Remind me: which two cities did we compare, what were their temperatures, " +
    "and which one did you recommend for a picnic?";

  console.log(`User: ${input}\n`);

  const result = await executor.invoke({ input, chat_history: chatHistory });

  await history.addMessage(new (await import("@langchain/core/messages")).HumanMessage(input));
  await history.addMessage(
    new (await import("@langchain/core/messages")).AIMessage(result.output as string)
  );

  console.log(`Claude (after restart): ${result.output}\n`);

  // Verify context preservation
  const lower = (result.output as string).toLowerCase();
  const remembered =
    (lower.includes("san francisco") || lower.includes("sf")) &&
    lower.includes("tokyo");
  console.log(`Context preserved across restart: ${remembered ? "YES" : "NO"}`);

  // Cleanup
  await history.clear();
  console.log("Cleaned up. Done!");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--invocation="));
  const invocation = flag ? parseInt(flag.split("=")[1]) : 0;

  if (invocation === 1) {
    const id = await invocation1();
    console.log(`\nTo resume:\n  DIALOGUE_ID=${id} npm run agent -- --invocation=2`);
  } else if (invocation === 2) {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId) throw new Error("DIALOGUE_ID env var required for invocation 2");
    await invocation2(dialogueId);
  } else {
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
