/**
 * Tool definitions and mock implementations for the advanced example.
 *
 * Gemini uses its own function declaration format — these are defined
 * using the @google/generative-ai SDK types.
 */

import type { FunctionDeclaration } from "@google/generative-ai";
import { SchemaType } from "@google/generative-ai";

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: "get_weather",
    description: "Get current weather for a location",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        location: {
          type: SchemaType.STRING,
          description: "City name",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "calculate",
    description:
      "Perform a mathematical calculation. Supports basic arithmetic: +, -, *, /",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        a: { type: SchemaType.NUMBER, description: "First operand" },
        b: { type: SchemaType.NUMBER, description: "Second operand" },
        operator: {
          type: SchemaType.STRING,
          description: "Operator: +, -, *, /",
        },
      },
      required: ["a", "b", "operator"],
    },
  },
  {
    name: "save_note",
    description: "Save a note for later reference",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: "Note title" },
        content: { type: SchemaType.STRING, description: "Note content" },
      },
      required: ["title", "content"],
    },
  },
];

/** Convert an object to a Record for property access (avoids type casting). */
function toRecord(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj));
}

/** Execute a tool call and return the result. */
export function executeTool(
  name: string,
  args: object
): Record<string, unknown> {
  const input = toRecord(args);

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
      return {
        location: input.location,
        temperature_f: temp,
        condition: temp > 60 ? "Sunny" : "Cloudy",
        humidity: "65%",
      };
    }

    case "calculate": {
      const a = Number(input.a);
      const b = Number(input.b);
      const op = String(input.operator);
      const ops: Record<string, (x: number, y: number) => number> = {
        "+": (x, y) => x + y,
        "-": (x, y) => x - y,
        "*": (x, y) => x * y,
        "/": (x, y) => x / y,
      };
      const fn = ops[op];
      if (!fn) return { error: `Unknown operator: ${op}` };
      return { a, operator: op, b, result: fn(a, b) };
    }

    case "save_note":
      return { saved: true, title: input.title };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
