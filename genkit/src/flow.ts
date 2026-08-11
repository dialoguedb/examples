/**
 * Genkit Flow — DialogueDB + Genkit Flows + Tools
 *
 * Shows how to build a reusable, type-safe chat flow with Genkit:
 * 1. Define tools that the model can call automatically
 * 2. Define a Genkit flow that persists conversations to DialogueDB
 * 3. Call the flow multiple times — DialogueDB maintains history between calls
 * 4. Simulate cold restart — the flow loads full history from DialogueDB
 *
 * Why Genkit flows? They're type-safe (Zod schemas), observable (built-in
 * tracing), and deployable (Cloud Functions, any HTTP server). DialogueDB
 * handles the persistence that Genkit doesn't provide out of the box.
 */

import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const ai = genkit({ plugins: [googleAI()] });
const db = new DialogueDB();
const gemini = googleAI.model("gemini-2.0-flash");

// ---------------------------------------------------------------------------
// Tools — Genkit executes these automatically when the model requests them
// ---------------------------------------------------------------------------

const getWeather = ai.defineTool(
  {
    name: "getWeather",
    description: "Gets the current weather for a given city",
    inputSchema: z.object({ city: z.string() }),
    outputSchema: z.object({
      city: z.string(),
      tempC: z.number(),
      condition: z.string(),
    }),
  },
  async ({ city }) => {
    const data: Record<string, { tempC: number; condition: string }> = {
      "San Francisco": { tempC: 16, condition: "foggy" },
      Tokyo: { tempC: 28, condition: "humid" },
      London: { tempC: 12, condition: "rainy" },
      Sydney: { tempC: 22, condition: "sunny" },
    };
    const weather = data[city] ?? { tempC: 20, condition: "partly cloudy" };
    console.log(`   [tool] getWeather("${city}") → ${weather.tempC}°C, ${weather.condition}`);
    return { city, ...weather };
  }
);

const saveNote = ai.defineTool(
  {
    name: "saveNote",
    description: "Saves a note for the user",
    inputSchema: z.object({ title: z.string(), body: z.string() }),
    outputSchema: z.object({ saved: z.boolean() }),
  },
  async ({ title, body }) => {
    console.log(`   [tool] saveNote("${title}"): ${body.slice(0, 80)}...`);
    return { saved: true };
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genkitRole(role: string): "user" | "model" {
  if (role === "model") return "model";
  return "user";
}

async function loadOrCreateDialogue(dialogueId?: string) {
  if (dialogueId) {
    const dialogue = await db.getDialogue(dialogueId);
    if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);
    await dialogue.loadMessages({ order: "asc" });
    return dialogue;
  }
  return db.createDialogue({
    label: "genkit-flow-chat",
    state: { provider: "google", format: "genkit", model: "gemini-2.0-flash" },
  });
}

// ---------------------------------------------------------------------------
// Flow — a reusable, type-safe chat function backed by DialogueDB
// ---------------------------------------------------------------------------

const persistentChat = ai.defineFlow(
  {
    name: "persistentChat",
    inputSchema: z.object({
      dialogueId: z.string().optional(),
      message: z.string(),
    }),
    outputSchema: z.object({
      dialogueId: z.string(),
      reply: z.string(),
      messageCount: z.number(),
    }),
  },
  async (input) => {
    const dialogue = await loadOrCreateDialogue(input.dialogueId);

    // Save user message to DialogueDB
    await dialogue.saveMessage({ role: "user", content: input.message });

    // Build Genkit message history (all messages except the one we just saved)
    const history = dialogue.messages.slice(0, -1).map((m) => ({
      role: genkitRole(m.role),
      content: [
        {
          text:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        },
      ],
    }));

    // Generate — Genkit handles the tool execution loop automatically
    const response = await ai.generate({
      model: gemini,
      ...(history.length > 0 ? { messages: history } : {}),
      prompt: input.message,
      tools: [getWeather, saveNote],
    });

    // Save model response to DialogueDB
    await dialogue.saveMessage({ role: "model", content: response.text });

    return {
      dialogueId: dialogue.id,
      reply: response.text,
      messageCount: dialogue.messages.length,
    };
  }
);

// ---------------------------------------------------------------------------
// Demo — call the flow three times, including across a cold restart
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB + Genkit Flow: Persistent Chat with Tools ===\n");

  // Exchange 1: Start a new conversation
  console.log("Exchange 1: Starting new conversation...\n");
  const result1 = await persistentChat({
    message:
      "I'm planning a trip. Can you check the weather in Tokyo and San Francisco?",
  });
  console.log(`Dialogue: ${result1.dialogueId}`);
  console.log(`Gemini: ${result1.reply.slice(0, 200)}...\n`);

  // Exchange 2: Continue with tools
  console.log("Exchange 2: Follow-up with note-taking...\n");
  const result2 = await persistentChat({
    dialogueId: result1.dialogueId,
    message:
      "Save a note summarizing the weather comparison, and recommend which city for outdoor activities.",
  });
  console.log(`Gemini: ${result2.reply.slice(0, 200)}...\n`);

  // Cold restart — same dialogue ID, fresh load from DialogueDB
  console.log("--- Simulating cold restart ---\n");
  const result3 = await persistentChat({
    dialogueId: result1.dialogueId,
    message:
      "Quick recap: what cities did we compare, what were the conditions, and what note did you save?",
  });
  console.log(`Gemini (after restart):\n${result3.reply}\n`);

  console.log(`Total messages persisted: ${result3.messageCount}`);

  // Cleanup
  await db.deleteDialogue(result1.dialogueId);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
