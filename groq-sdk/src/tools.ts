/**
 * Tool definitions and mock implementations for the advanced example.
 */

import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";

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
      name: "get_game_score",
      description: "Get the latest score for a sports game",
      parameters: {
        type: "object",
        properties: {
          team: { type: "string", description: "Team name" },
        },
        required: ["team"],
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
        "los angeles": 75,
        chicago: 38,
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

    case "get_game_score": {
      const scores: Record<string, { opponent: string; score: string }> = {
        lakers: { opponent: "Celtics", score: "112-108" },
        warriors: { opponent: "Nuggets", score: "105-99" },
        chiefs: { opponent: "Eagles", score: "24-21" },
      };
      const team = String(input.team).toLowerCase();
      const game = scores[team] ?? {
        opponent: "Unknown",
        score: "0-0",
      };
      return JSON.stringify({
        team: input.team,
        opponent: game.opponent,
        score: game.score,
        status: "Final",
      });
    }

    case "save_note":
      return JSON.stringify({ saved: true, title: input.title });

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
