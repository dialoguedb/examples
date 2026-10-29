/**
 * LangGraph Agent — DialogueDB + LangGraph
 *
 * Builds a graph-based ReAct agent with DialogueDB persistence:
 * 1. Define a StateGraph with agent and tools nodes
 * 2. Run multi-tool queries — the graph routes between model and tools
 * 3. Persist conversation history to DialogueDB after each turn
 * 4. Cold restart — load the conversation, continue with full context
 *
 * Unlike a plain LangChain chain, LangGraph gives you explicit, visible
 * control over the agent loop: you define the nodes, edges, and routing.
 * DialogueDB gives you persistent, cross-process conversation memory.
 */

import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

// -- DialogueDB setup --

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

// -- Tools --

const weatherTool = tool(
  async ({ location }) => {
    const data: Record<string, string> = {
      "san francisco": "62°F, Foggy, Wind: 12mph NW",
      "new york": "45°F, Cloudy, Wind: 8mph E",
      "tokyo": "75°F, Clear, Wind: 5mph S",
      "london": "52°F, Rainy, Wind: 15mph W",
    };
    return data[location.toLowerCase()] ?? `${location}: 68°F, Fair`;
  },
  {
    name: "get_weather",
    description: "Get current weather conditions for a city",
    schema: z.object({
      location: z.string().describe("City name"),
    }),
  }
);

const convertTempTool = tool(
  async ({ value, from, to }) => {
    if (from === "fahrenheit" && to === "celsius") {
      return `${value}°F = ${(((value - 32) * 5) / 9).toFixed(1)}°C`;
    }
    if (from === "celsius" && to === "fahrenheit") {
      return `${value}°C = ${((value * 9) / 5 + 32).toFixed(1)}°F`;
    }
    return `Cannot convert from ${from} to ${to}`;
  },
  {
    name: "convert_temperature",
    description: "Convert a temperature between Fahrenheit and Celsius",
    schema: z.object({
      value: z.number().describe("The temperature value to convert"),
      from: z.enum(["fahrenheit", "celsius"]).describe("Source unit"),
      to: z.enum(["fahrenheit", "celsius"]).describe("Target unit"),
    }),
  }
);

const tools = [weatherTool, convertTempTool];

// -- Graph definition --
//
//   START → agent → (tool calls?) → tools → agent (loop back)
//                  → (no tool calls) → END

const model = new ChatOpenAI({ model: MODEL, temperature: 0 }).bindTools(tools);

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
}

function shouldContinue(state: typeof MessagesAnnotation.State): string {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.length) {
    return "tools";
  }
  return END;
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent")
  .compile();

// -- DialogueDB helpers --

function toBaseMessages(dialogue: Dialogue): BaseMessage[] {
  return dialogue.messages.map((m) => {
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "assistant") return new AIMessage(content);
    return new HumanMessage(content);
  });
}

function getResponseText(message: BaseMessage): string {
  if (typeof message.content === "string") return message.content;
  return JSON.stringify(message.content);
}

async function runTurn(
  dialogue: Dialogue,
  history: BaseMessage[],
  userInput: string
): Promise<{ response: string; updatedHistory: BaseMessage[] }> {
  await dialogue.saveMessage({ role: "user", content: userInput });

  const result = await graph.invoke({
    messages: [...history, new HumanMessage(userInput)],
  });

  const allMessages: BaseMessage[] = result.messages;
  const lastMessage = allMessages[allMessages.length - 1];
  const response = getResponseText(lastMessage);

  await dialogue.saveMessage({ role: "assistant", content: response });

  return {
    response,
    updatedHistory: [
      ...history,
      new HumanMessage(userInput),
      new AIMessage(response),
    ],
  };
}

// ---------------------------------------------------------------------------
// Invocation 1 — multi-tool conversation
// ---------------------------------------------------------------------------

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Graph Agent with Tools ===\n");

  const dialogue = await db.createDialogue({
    label: "langgraph-agent-demo",
    state: { provider: "openai", format: "langgraph", model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  let history: BaseMessage[] = [];

  const input1 =
    "Compare the weather in San Francisco and Tokyo. " +
    "Convert both temperatures to Celsius.";
  console.log(`User: ${input1}\n`);
  const turn1 = await runTurn(dialogue, history, input1);
  console.log(`Agent: ${turn1.response.slice(0, 250)}...\n`);
  history = turn1.updatedHistory;

  const input2 =
    "Based on those conditions, which city is better for a picnic today and why?";
  console.log(`User: ${input2}\n`);
  const turn2 = await runTurn(dialogue, history, input2);
  console.log(`Agent: ${turn2.response.slice(0, 250)}...\n`);

  console.log(`--- Invocation 1 done. Dialogue ID: ${dialogue.id} ---\n`);
  return dialogue.id;
}

// ---------------------------------------------------------------------------
// Invocation 2 — cold resume
// ---------------------------------------------------------------------------

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Cold Resume ===\n");

  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);
  await dialogue.loadMessages({ order: "asc" });
  console.log(`Loaded ${dialogue.messages.length} messages from DialogueDB\n`);

  const history = toBaseMessages(dialogue);

  const input =
    "Remind me: which two cities did we compare, what were their temperatures " +
    "in Celsius, and which did you recommend for a picnic?";
  console.log(`User: ${input}\n`);
  const turn = await runTurn(dialogue, history, input);
  console.log(`Agent (after restart): ${turn.response}\n`);

  const lower = turn.response.toLowerCase();
  const remembered =
    (lower.includes("san francisco") || lower.includes("sf")) &&
    lower.includes("tokyo");
  console.log(
    `Context preserved across restart: ${remembered ? "YES" : "NO"}`
  );

  await db.deleteDialogue(dialogueId);
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
    console.log(
      `\nTo resume:\n  DIALOGUE_ID=${id} npm run agent -- --invocation=2`
    );
  } else if (invocation === 2) {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId)
      throw new Error("DIALOGUE_ID env var required for invocation 2");
    await invocation2(dialogueId);
  } else {
    const id = await invocation1();
    await invocation2(id);
  }
}

main().catch(console.error);
