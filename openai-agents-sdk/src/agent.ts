import { Agent, tool } from "@openai/agents";
import { z } from "zod";

/**
 * A small agent with two tools. The tools exist so the persisted conversation
 * actually contains function_call and function_call_result items, which is the
 * part of the mapping most likely to be got wrong.
 */

const getWeather = tool({
  name: "get_weather",
  description: "Get the current weather for a city.",
  parameters: z.object({
    city: z.string().describe("The city to look up, for example Lisbon"),
  }),
  execute: async ({ city }) => {
    // Fixed data so the demo is deterministic and needs no third-party key.
    const table: Record<string, string> = {
      lisbon: "19C and clear",
      oslo: "3C and raining",
      paris: "14C and overcast",
    };
    return table[city.toLowerCase()] ?? "12C and partly cloudy";
  },
});

const convertCurrency = tool({
  name: "convert_currency",
  description: "Convert an amount between two currencies.",
  parameters: z.object({
    amount: z.number().describe("The amount to convert"),
    from: z.string().describe("Source currency code, for example USD"),
    to: z.string().describe("Target currency code, for example EUR"),
  }),
  execute: async ({ amount, from, to }) => {
    const rates: Record<string, number> = {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      NOK: 10.6,
    };
    const rate =
      (rates[to.toUpperCase()] ?? 1) / (rates[from.toUpperCase()] ?? 1);
    return `${amount} ${from.toUpperCase()} is about ${(amount * rate).toFixed(2)} ${to.toUpperCase()}`;
  },
});

export const MODEL = "gpt-4o";

/**
 * Instructions are built per run so retrieved memories can be injected. The
 * agent itself stays stateless; DialogueDB carries what it needs to remember.
 */
export function buildAgent(recalledFacts: string[]): Agent {
  const memoryBlock =
    recalledFacts.length > 0
      ? `\n\nWhat you already know about this user:\n` +
        recalledFacts.map((fact) => `- ${fact}`).join("\n")
      : "";

  return new Agent({
    name: "Travel assistant",
    model: MODEL,
    instructions:
      "You are a concise travel assistant. Use your tools when they are the " +
      "right way to answer. Keep answers to one or two sentences." +
      memoryBlock,
    tools: [getWeather, convertCurrency],
  });
}
