/**
 * Tool definitions and mock implementations for the advanced example.
 */

import type Anthropic from "@anthropic-ai/sdk";

export const tools: Anthropic.Tool[] = [
  {
    name: "get_weather",
    description: "Get current weather for a location",
    input_schema: {
      type: "object" as const,
      properties: {
        location: { type: "string", description: "City name" },
      },
      required: ["location"],
    },
  },
  {
    name: "calculate",
    description: "Perform a mathematical calculation",
    input_schema: {
      type: "object" as const,
      properties: {
        expression: {
          type: "string",
          description: "Math expression to evaluate (e.g. '(72 - 58) * 5/9')",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "save_note",
    description: "Save a note for later reference",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Note title" },
        content: { type: "string", description: "Note content" },
      },
      required: ["title", "content"],
    },
  },
];

/** Read a string argument without asserting on the model's input. */
function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value : "";
}

/**
 * Evaluate a basic arithmetic expression.
 *
 * A recursive-descent parser rather than `new Function()` or `eval()`: the
 * expression comes from the model, so it must never be executed as code. Only
 * numbers, + - * / %, parentheses, and unary signs are accepted; anything else
 * throws.
 */
function evaluateArithmetic(expression: string): number {
  let index = 0;

  const skipSpace = (): void => {
    while (index < expression.length && /\s/.test(expression[index])) index += 1;
  };

  const parseFactor = (): number => {
    skipSpace();
    const char = expression[index];

    if (char === "+") {
      index += 1;
      return parseFactor();
    }
    if (char === "-") {
      index += 1;
      return -parseFactor();
    }
    if (char === "(") {
      index += 1;
      const inner = parseSum();
      skipSpace();
      if (expression[index] !== ")") throw new Error("Unbalanced parentheses");
      index += 1;
      return inner;
    }

    const start = index;
    while (index < expression.length && /[0-9.]/.test(expression[index])) index += 1;
    if (start === index) throw new Error(`Unexpected character at position ${index}`);

    const value = Number(expression.slice(start, index));
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  };

  const parseProduct = (): number => {
    let value = parseFactor();
    for (;;) {
      skipSpace();
      const operator = expression[index];
      if (operator !== "*" && operator !== "/" && operator !== "%") return value;
      index += 1;
      const right = parseFactor();
      if (right === 0 && operator !== "*") throw new Error("Division by zero");
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
  };

  const parseSum = (): number => {
    let value = parseProduct();
    for (;;) {
      skipSpace();
      const operator = expression[index];
      if (operator !== "+" && operator !== "-") return value;
      index += 1;
      const right = parseProduct();
      value = operator === "+" ? value + right : value - right;
    }
  };

  const result = parseSum();
  skipSpace();
  if (index !== expression.length) {
    throw new Error(`Unexpected input at position ${index}`);
  }
  return result;
}

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
      const location = readString(input, "location").toLowerCase();
      const temp = temps[location] ?? 70;
      return JSON.stringify({
        location: input.location,
        temperature_f: temp,
        condition: temp > 60 ? "Sunny" : "Cloudy",
        humidity: "65%",
      });
    }

    case "calculate": {
      const expression = readString(input, "expression");
      try {
        return JSON.stringify({ expression, result: evaluateArithmetic(expression) });
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : "invalid expression";
        return JSON.stringify({ error: `Could not evaluate "${expression}": ${reason}` });
      }
    }

    case "save_note":
      return JSON.stringify({ saved: true, title: input.title });

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
