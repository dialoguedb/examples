/**
 * Hello World — DialogueDB + Instructor
 *
 * Structured extraction that accumulates across sessions.
 * User info arrives in multiple messages. Instructor extracts a typed
 * profile from the full conversation each time. DialogueDB persists
 * the messages — so extraction picks up right where it left off
 * after a cold restart.
 */

import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const instructor = Instructor({ client: openai, mode: "TOOLS" });
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

const UserProfileSchema = z.object({
  name: z.string().describe("Full name"),
  role: z.string().describe("Job title or role"),
  company: z.string().describe("Company name"),
  project: z.string().describe("What they are building or working on"),
  technologies: z
    .array(z.string())
    .describe("Technologies, tools, or frameworks mentioned"),
});

type UserProfile = z.infer<typeof UserProfileSchema>;

/** Build extraction messages from the dialogue's user messages. */
function buildMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  const userMsgs: OpenAI.ChatCompletionMessageParam[] = dialogue.messages
    .filter((m) => m.role === "user")
    .map((m) => ({
      role: "user" as const,
      content:
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

  return [
    {
      role: "system" as const,
      content:
        "Extract the user's profile from the conversation. Use 'unknown' for fields not yet mentioned. Return only what the user has explicitly stated.",
    },
    ...userMsgs,
  ];
}

/** Extract a UserProfile from the full conversation so far. */
async function extractProfile(dialogue: Dialogue): Promise<UserProfile> {
  return instructor.chat.completions.create({
    model: MODEL,
    messages: buildMessages(dialogue),
    response_model: { schema: UserProfileSchema, name: "UserProfile" },
  });
}

async function main() {
  console.log("=== DialogueDB + Instructor: Hello World ===\n");

  // 1. Create a new conversation
  const dialogue = await db.createDialogue({
    label: "instructor-hello-world",
    state: { model: MODEL },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // 2. First message — partial info
  await dialogue.saveMessage({
    role: "user",
    content:
      "Hi! I'm Sarah Chen and I work as a backend engineer at Dataflow Labs.",
  });
  const profile1 = await extractProfile(dialogue);
  console.log("After message 1:", profile1);

  // 3. Second message — more context accumulates
  await dialogue.saveMessage({
    role: "user",
    content:
      "I'm building a real-time analytics pipeline using Kafka and ClickHouse, with a React dashboard on the frontend.",
  });
  const profile2 = await extractProfile(dialogue);
  console.log("\nAfter message 2:", profile2);

  // 4. COLD RESTART — load the conversation fresh from DialogueDB
  console.log("\n--- Simulating cold restart ---\n");
  const resumed = await db.getDialogue(dialogue.id);
  if (!resumed) throw new Error("Failed to load dialogue");
  await resumed.loadMessages({ order: "asc" });
  console.log(`Loaded ${resumed.messages.length} messages from DialogueDB\n`);

  // 5. Third message after restart — Instructor gets the full history
  await resumed.saveMessage({
    role: "user",
    content:
      "We're also integrating Redis for caching and planning to add WebSocket support for live updates.",
  });
  const profile3 = await extractProfile(resumed);
  console.log("After restart + message 3:", profile3);

  // 6. Verify context accumulated across the restart
  const contextPreserved =
    profile3.name.toLowerCase().includes("sarah") &&
    profile3.technologies.length >= 4;
  console.log(
    `\nContext preserved across restart: ${contextPreserved ? "YES" : "NO"}`
  );
  console.log(`Technologies found: ${profile3.technologies.join(", ")}`);
  console.log(`Total messages: ${resumed.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogue.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
