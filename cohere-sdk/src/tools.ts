/**
 * Tool definitions and mock implementations for the advanced example.
 *
 * Cohere's v2 API uses the same JSON Schema format for tool parameters
 * as OpenAI, wrapped in a ToolV2 type.
 */

import type { Cohere } from "cohere-ai";

export const tools: Cohere.ToolV2[] = [
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
      description:
        "Perform a basic arithmetic calculation. Supports +, -, *, / on two numbers.",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number", description: "First operand" },
          b: { type: "number", description: "Second operand" },
          op: {
            type: "string",
            enum: ["+", "-", "*", "/"],
            description: "Arithmetic operator",
          },
        },
        required: ["a", "b", "op"],
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

    case "calculate": {
      const a = Number(input.a);
      const b = Number(input.b);
      const op = String(input.op);
      let result: number;
      switch (op) {
        case "+":
          result = a + b;
          break;
        case "-":
          result = a - b;
          break;
        case "*":
          result = a * b;
          break;
        case "/":
          result = b !== 0 ? a / b : NaN;
          break;
        default:
          return JSON.stringify({ error: `Unknown operator: ${op}` });
      }
      return JSON.stringify({ a, op, b, result });
    }

    case "save_note":
      return JSON.stringify({ saved: true, title: input.title });

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
