/**
 * Tool definitions for the streaming example.
 *
 * Uses Vercel AI SDK's `tool()` helper with Zod schemas —
 * the SDK handles parameter validation and type inference automatically.
 */

import { tool } from "ai";
import { z } from "zod";

export const weatherTool = tool({
  description: "Get the current weather for a city",
  parameters: z.object({
    city: z.string().describe("The city name"),
  }),
  execute: async ({ city }) => {
    // Simulated weather data
    const conditions: Record<string, { temp: number; condition: string }> = {
      "san francisco": { temp: 16, condition: "foggy" },
      tokyo: { temp: 24, condition: "sunny" },
      london: { temp: 12, condition: "rainy" },
      sydney: { temp: 28, condition: "clear" },
    };
    const data = conditions[city.toLowerCase()] ?? {
      temp: 20,
      condition: "partly cloudy",
    };
    return { city, ...data, unit: "celsius" };
  },
});

export const calculatorTool = tool({
  description: "Perform a math calculation",
  parameters: z.object({
    expression: z
      .string()
      .describe("A simple math expression like '24 - 16'"),
  }),
  execute: async ({ expression }) => {
    // Safely evaluate simple arithmetic
    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, "");
    try {
      // Using Function instead of eval for slightly better isolation
      const result = new Function(`return (${sanitized})`)() as number;
      return { expression, result };
    } catch {
      return { expression, error: "Could not evaluate expression" };
    }
  },
});

export const notesTool = tool({
  description: "Save a note for later reference",
  parameters: z.object({
    title: z.string().describe("Short title for the note"),
    content: z.string().describe("The note content"),
  }),
  execute: async ({ title, content }) => {
    // In a real app, you'd persist this. Here we just confirm.
    return { saved: true, title, length: content.length };
  },
});
