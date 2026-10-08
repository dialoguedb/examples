/**
 * Tool Calling - DialogueDB + Genkit
 *
 * Genkit resolves tool calls automatically: it calls the model, executes
 * any tools the model requests, and returns the final text response.
 * This example persists the full conversation (including tool interactions)
 * in DialogueDB, then resumes from a cold start with full context.
 */

import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { requireEnv } from "./env.js";
import { getSystemPrompt, loadDialogue, toGenkitHistory } from "./persist.js";

const NAMESPACE = "tool-calling";
const MODEL = "gemini-2.0-flash";

const ai = genkit({ plugins: [googleAI()] });
const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

const getWeather = ai.defineTool(
  {
    name: "getWeather",
    description: "Gets the current weather for a given city.",
    inputSchema: z.object({ city: z.string() }),
    outputSchema: z.object({
      city: z.string(),
      temperatureF: z.number(),
      condition: z.string(),
    }),
  },
  async ({ city }) => {
    const conditions: Record<string, { temperatureF: number; condition: string }> = {
      tokyo: { temperatureF: 68, condition: "partly cloudy" },
      london: { temperatureF: 55, condition: "rainy" },
      "new york": { temperatureF: 72, condition: "sunny" },
    };
    const key = city.toLowerCase();
    const weather = conditions[key] ?? { temperatureF: 65, condition: "clear" };
    console.log(`  [tool] getWeather("${city}") → ${weather.temperatureF}°F, ${weather.condition}`);
    return { city, ...weather };
  },
);

const saveNote = ai.defineTool(
  {
    name: "saveNote",
    description: "Saves a note for the user.",
    inputSchema: z.object({ title: z.string(), body: z.string() }),
    outputSchema: z.object({ saved: z.boolean(), title: z.string() }),
  },
  async ({ title, body }) => {
    console.log(`  [tool] saveNote("${title}") → "${body.slice(0, 60)}..."`);
    return { saved: true, title };
  },
);

const tools = [getWeather, saveNote];

async function runTurn(
  client: DialogueDB,
  dialogueId: string,
  input: string,
): Promise<string> {
  const dialogue = await loadDialogue(client, dialogueId, NAMESPACE);

  await dialogue.saveMessage({ role: "user", content: input });

  const allHistory = toGenkitHistory(dialogue);
  const history = allHistory.slice(0, -1);
  const system = getSystemPrompt(dialogue);

  const response = await ai.generate({
    model: googleAI.model(MODEL),
    system,
    messages: history,
    prompt: input,
    tools,
    config: { maxOutputTokens: 300 },
  });

  // Genkit resolves tool calls internally. The response.messages array
  // contains the full conversation including tool request/response turns.
  // We persist everything so a cold restart has complete context.
  const newMessages = response.messages.slice(allHistory.length);
  for (const msg of newMessages) {
    await dialogue.saveMessage({
      role: msg.role === "model" ? "assistant" : msg.role,
      content: msg.content,
    });
  }

  return response.text;
}

async function main(): Promise<void> {
  console.log("=== DialogueDB + Genkit: Tool Calling ===\n");

  const dialogueId = `genkit-tools-${Date.now()}`;

  const created = await loadDialogue(db, dialogueId, NAMESPACE);
  await created.saveMessage({
    role: "system",
    content:
      "You are a helpful travel assistant. Use the getWeather tool to look up weather " +
      "and the saveNote tool to save travel plans. Be concise.",
  });

  console.log("Turn 1: asking about weather with tool calls\n");
  const reply1 = await runTurn(
    db,
    dialogueId,
    "What's the weather like in Tokyo and London right now?",
  );
  console.log(`\nAssistant: ${reply1.trim()}\n`);

  console.log("Turn 2: asking to save a note (references prior context)\n");
  const reply2 = await runTurn(
    db,
    dialogueId,
    "Save a note titled 'Trip Plan' summarizing which city has better weather for sightseeing.",
  );
  console.log(`\nAssistant: ${reply2.trim()}\n`);

  // Cold restart: new client, new process, same dialogue.
  console.log("--- simulating a cold restart ---\n");
  const cold = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });
  const resumed = await loadDialogue(cold, dialogueId, NAMESPACE);
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  console.log("Turn 3: follow-up that requires context from before the restart\n");
  const reply3 = await runTurn(
    cold,
    dialogueId,
    "Which city did you recommend, and what was the temperature there?",
  );
  console.log(`\nAssistant: ${reply3.trim()}\n`);

  const lower = reply3.toLowerCase();
  const remembered =
    lower.includes("tokyo") || lower.includes("london") || lower.includes("68") || lower.includes("55");
  console.log(
    remembered ? "Context survived the restart." : "Context was lost.",
  );

  await cold.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log("Cleaned up the demo dialogue.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
