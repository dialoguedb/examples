/**
 * Tool definitions and mock implementations for the tool-use example.
 */

import type { Tool } from "@mistralai/mistralai/models/components/tool.js";

export const tools: Tool[] = [
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
      description:
        "Convert a temperature between Fahrenheit and Celsius",
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
        paris: 55,
      };
      const location = (input.location as string).toLowerCase();
      const temp = temps[location] ?? 70;
      return JSON.stringify({
        location: input.location,
        temperature_f: temp,
        condition: temp > 60 ? "Sunny" : "Cloudy",
        humidity: "65%",
      });
    }

    case "convert_temperature": {
      const value = input.value as number;
      const from = input.from as string;
      const to = input.to as string;
      let result: number;
      if (from === "fahrenheit" && to === "celsius") {
        result = Math.round(((value - 32) * 5) / 9 * 10) / 10;
      } else if (from === "celsius" && to === "fahrenheit") {
        result = Math.round((value * 9 / 5 + 32) * 10) / 10;
      } else {
        result = value;
      }
      return JSON.stringify({ from: `${value}°${from[0].toUpperCase()}`, to: `${result}°${to[0].toUpperCase()}` });
    }

    case "save_note":
      return JSON.stringify({ saved: true, title: input.title });

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
