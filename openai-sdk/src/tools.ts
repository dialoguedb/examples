/**
 * Tool definitions and mock implementations for the advanced example.
 */

import type OpenAI from "openai";

export const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name" },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Perform a mathematical calculation",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description:
              "Math expression to evaluate (e.g. '(72 - 58) * 5/9')",
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_note",
      description: "Save a note for later reference",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Note title" },
          content: { type: "string", description: "Note content" },
        },
        required: ["title", "content"],
      },
    },
  },
];

/** Execute a tool call and return the result as a string. */
export function executeTool(
  name: string,
  args: Record<string, unknown>
): string {
  switch (name) {
    case "get_weather": {
      const temps: Record<string, number> = {
        "san francisco": 62,
        "new york": 45,
        london: 52,
        tokyo: 58,
      };
      const location = (args.location as string).toLowerCase();
      const temp = temps[location] ?? 70;
      return JSON.stringify({
        location: args.location,
        temperature_f: temp,
        condition: temp > 60 ? "Sunny" : "Cloudy",
        humidity: "65%",
      });
    }

    case "calculate": {
      try {
        const result = Function(
          `"use strict"; return (${args.expression})`
        )();
        return JSON.stringify({ expression: args.expression, result });
      } catch {
        return JSON.stringify({
          error: `Could not evaluate: ${args.expression}`,
        });
      }
    }

    case "save_note":
      return JSON.stringify({ saved: true, title: args.title });

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
