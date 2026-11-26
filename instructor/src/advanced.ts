/**
 * Advanced — DialogueDB + Instructor
 *
 * Two-process project intake that extracts a structured brief across sessions.
 *
 * Invocation 1: User describes a project. Instructor extracts a typed brief
 *   with features, constraints, and a completeness estimate. Prints the
 *   dialogue ID so invocation 2 can resume.
 *
 * Invocation 2: Loads the dialogue from DialogueDB, picks up where the user
 *   left off, adds more detail, and completes the brief.
 *
 * Run both back-to-back:    npm run advanced
 * Run separately:           npm run advanced:1
 *                           DIALOGUE_ID=<id> npm run advanced:2
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

// -- Schemas --

const FeatureSchema = z.object({
  name: z.string().describe("Feature name"),
  priority: z
    .enum(["must-have", "nice-to-have", "future"])
    .describe("Priority level"),
});

const ProjectBriefSchema = z.object({
  title: z.string().describe("Project title"),
  description: z.string().describe("One-sentence project description"),
  targetAudience: z
    .string()
    .describe("Who the product is for, or 'unknown'"),
  features: z
    .array(FeatureSchema)
    .describe("Requested features with priority levels"),
  technicalConstraints: z
    .array(z.string())
    .describe("Technical requirements or constraints mentioned"),
  timeline: z.string().describe("Delivery timeline, or 'unknown'"),
  budget: z.string().describe("Budget if mentioned, or 'unknown'"),
  completeness: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "How complete this brief is as a percentage — 100 means all key fields are filled with specific values"
    ),
});

type ProjectBrief = z.infer<typeof ProjectBriefSchema>;

// -- Helpers --

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
      content: [
        "Extract a project brief from this conversation.",
        "Fill in every field you can from what the user has said.",
        "Use 'unknown' for text fields not yet discussed.",
        "Estimate completeness: 0 = nothing useful, 100 = all fields have specific values.",
      ].join(" "),
    },
    ...userMsgs,
  ];
}

async function extractBrief(dialogue: Dialogue): Promise<ProjectBrief> {
  return instructor.chat.completions.create({
    model: MODEL,
    messages: buildMessages(dialogue),
    response_model: { schema: ProjectBriefSchema, name: "ProjectBrief" },
  });
}

function printBrief(brief: ProjectBrief) {
  console.log(`  Title:        ${brief.title}`);
  console.log(`  Description:  ${brief.description}`);
  console.log(`  Audience:     ${brief.targetAudience}`);
  console.log(`  Timeline:     ${brief.timeline}`);
  console.log(`  Budget:       ${brief.budget}`);
  console.log(`  Constraints:  ${brief.technicalConstraints.join(", ") || "(none)"}`);
  console.log(`  Features:`);
  for (const f of brief.features) {
    console.log(`    - [${f.priority}] ${f.name}`);
  }
  console.log(`  Completeness: ${brief.completeness}%`);
}

// -- Invocations --

async function invocation1(): Promise<string> {
  console.log("=== Invocation 1: Initial intake ===\n");

  const dialogue = await db.createDialogue({
    label: "instructor-project-intake",
    state: { model: MODEL, stage: "initial" },
  });
  console.log(`Created dialogue: ${dialogue.id}\n`);

  // First message: high-level project description
  await dialogue.saveMessage({
    role: "user",
    content:
      "I need a customer portal for our B2B SaaS platform. It should handle single sign-on, billing management, and usage analytics dashboards.",
  });
  const brief1 = await extractBrief(dialogue);
  console.log("After initial description:");
  printBrief(brief1);

  // Second message: audience and integration details
  await dialogue.saveMessage({
    role: "user",
    content:
      "Target audience is enterprise IT administrators. SSO must integrate with Okta and Azure AD. Billing goes through Stripe.",
  });
  const brief2 = await extractBrief(dialogue);
  console.log("\nAfter adding audience and integrations:");
  printBrief(brief2);

  await dialogue.saveState({
    model: MODEL,
    stage: "partial",
    lastExtraction: brief2,
  });

  console.log(`\n--- Dialogue ID: ${dialogue.id} ---`);
  console.log("Pass this to invocation 2 to continue the intake.\n");
  return dialogue.id;
}

async function invocation2(dialogueId: string) {
  console.log("=== Invocation 2: Complete the brief ===\n");

  const dialogue = await db.getDialogue(dialogueId);
  if (!dialogue) throw new Error(`Dialogue ${dialogueId} not found`);
  await dialogue.loadMessages({ order: "asc" });
  console.log(
    `Loaded ${dialogue.messages.length} messages from DialogueDB\n`
  );

  // Show what was previously extracted
  const previousExtraction = dialogue.state
    ?.lastExtraction as ProjectBrief | undefined;
  if (previousExtraction) {
    console.log("Previous extraction (from invocation 1):");
    printBrief(previousExtraction);
    console.log();
  }

  // Third message: timeline, budget, and compliance
  await dialogue.saveMessage({
    role: "user",
    content:
      "Timeline is Q1 next year. Budget is around $150K. The portal needs WCAG 2.1 AA accessibility compliance and SOC 2 Type II certification.",
  });
  const brief3 = await extractBrief(dialogue);
  console.log("After adding timeline, budget, and compliance:");
  printBrief(brief3);

  // Fourth message: feature priorities
  await dialogue.saveMessage({
    role: "user",
    content:
      "SSO and billing are must-haves for launch. Usage analytics dashboards are nice-to-have. We might want a self-service API portal in the future.",
  });
  const brief4 = await extractBrief(dialogue);
  console.log("\nFinal brief with feature priorities:");
  printBrief(brief4);

  console.log(`\nTotal messages across both sessions: ${dialogue.messages.length}`);

  // Cleanup
  await db.deleteDialogue(dialogueId);
  console.log("Cleaned up. Done!");
}

// -- Entry point --

async function main() {
  const invocationArg = process.argv.find((a) => a.startsWith("--invocation="));
  const invocation = invocationArg?.split("=")[1];

  if (invocation === "1") {
    await invocation1();
  } else if (invocation === "2") {
    const dialogueId = process.env.DIALOGUE_ID;
    if (!dialogueId) {
      console.error("Set DIALOGUE_ID env var from invocation 1 output.");
      process.exit(1);
    }
    await invocation2(dialogueId);
  } else {
    // Run both back-to-back
    const dialogueId = await invocation1();
    console.log("--- Simulating cold restart ---\n");
    await invocation2(dialogueId);
  }
}

main().catch(console.error);
