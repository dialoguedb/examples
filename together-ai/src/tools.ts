/**
 * Tool definitions and mock implementations for the advanced example.
 *
 * Together AI supports function calling on select models (e.g. Llama 3).
 * Tools follow the OpenAI-compatible format.
 */

import type { ChatCompletionTool } from "together-ai/resources/chat/completions";

export const tools: ChatCompletionTool[] = [
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
      name: "convert_temperature",
      description: "Convert a temperature between Fahrenheit and Celsius",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "Temperature value" },
          from: {
            type: "string",
            enum: ["fahrenheit", "celsius"],
            description: "Source unit",
          },
          to: {
            type: "string",
            enum: ["fahrenheit", "celsius"],
            description: "Target unit",
          },
        },
        required: ["value", "from", "to"],
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
  input: Record<string, unknown>
): string {
  switch (name) {
    case "get_weather": {
      const temps: Record<string, number> = {
        "san francisco": 62,
        "new york": 45,
        london: 52,
        tokyo: 58,
      };
      const location = String(input.location).toLowerCase();
      const temp = temps[location] ?? 70;
      return JSON.stringify({
        location: input.location,
        temperature_f: temp,
        condition: temp > 60 ? "Sunny" : "Cloudy",
        humidity: "65%",
      });
    }

    case "convert_temperature": {
      const value = Number(input.value);
      const from = String(input.from);
      const to = String(input.to);

      let result: number;
      if (from === "fahrenheit" && to === "celsius") {
        result = Math.round(((value - 32) * 5) / 9 * 10) / 10;
      } else if (from === "celsius" && to === "fahrenheit") {
        result = Math.round((value * 9 / 5 + 32) * 10) / 10;
      } else {
        result = value;
      }

      return JSON.stringify({ value, from, to, result });
    }

    case "save_note":
      return JSON.stringify({ saved: true, title: input.title });

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
