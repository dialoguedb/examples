import type { FunctionDeclaration, Part } from "@google/genai";

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "get_weather",
    description: "Get current weather for a location",
    parametersJsonSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
      },
      required: ["location"],
    },
  },
  {
    name: "calculate",
    description:
      "Perform a simple arithmetic calculation (e.g. '62 - 58', '14 * 5')",
    parametersJsonSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Simple math expression: two numbers with an operator",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "save_note",
    description: "Save a note for later reference",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
        content: { type: "string", description: "Note content" },
      },
      required: ["title", "content"],
    },
  },
];

export function executeTool(
  name: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  switch (name) {
    case "get_weather": {
      const temps: Record<string, number> = {
        "san francisco": 62,
        "new york": 45,
        london: 52,
        tokyo: 58,
      };
      const location = String(args.location).toLowerCase();
      const temp = temps[location] ?? 70;
      return {
        location: args.location,
        temperature_f: temp,
        condition: temp > 60 ? "Sunny" : "Cloudy",
        humidity: "65%",
      };
    }

    case "calculate": {
      const expr = String(args.expression).trim();
      const match = expr.match(
        /^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/
      );
      if (!match) {
        return { error: `Cannot evaluate: ${expr}` };
      }
      const left = parseFloat(match[1]);
      const op = match[2];
      const right = parseFloat(match[3]);
      const ops: Record<string, (a: number, b: number) => number> = {
        "+": (a, b) => a + b,
        "-": (a, b) => a - b,
        "*": (a, b) => a * b,
        "/": (a, b) => a / b,
      };
      const fn = ops[op];
      if (!fn) return { error: `Unknown operator: ${op}` };
      return { expression: expr, result: fn(left, right) };
    }

    case "save_note":
      return { saved: true, title: args.title };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/** Build a functionResponse Part from a tool execution result. */
export function buildFunctionResponsePart(
  name: string,
  id: string,
  response: Record<string, unknown>
): Part {
  return {
    functionResponse: { name, id, response },
  };
}
