/**
 * Tool definitions and mock implementations for the advanced example.
 * Uses the JSON Schema format that Cohere's V2 API expects.
 */

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const tools: ToolDefinition[] = [
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
          temperature: { type: "number", description: "Temperature value" },
          to: {
            type: "string",
            enum: ["celsius", "fahrenheit"],
            description: "Target unit",
          },
        },
        required: ["temperature", "to"],
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
      const temp = Number(input.temperature);
      const to = String(input.to);
      if (to === "celsius") {
        const celsius = Math.round(((temp - 32) * 5) / 9 * 10) / 10;
        return JSON.stringify({
          original: `${temp}°F`,
          converted: `${celsius}°C`,
        });
      }
      const fahrenheit = Math.round((temp * 9 / 5 + 32) * 10) / 10;
      return JSON.stringify({
        original: `${temp}°C`,
        converted: `${fahrenheit}°F`,
      });
    }

    case "save_note":
      return JSON.stringify({ saved: true, title: input.title });

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
