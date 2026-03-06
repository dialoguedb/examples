/**
 * Audit Logging — Automatic audit trail via Agent SDK hooks
 *
 * The simplest, most reusable pattern: a single function that returns
 * Agent SDK hooks config. Attach it to any query() call and every tool
 * call gets persisted to a DialogueDB dialogue — searchable, timestamped,
 * queryable from any service.
 *
 * Usage in your own code:
 *   const auditLog = await db.createDialogue({ label: "audit" });
 *   const hooks = createAuditHook(auditLog);
 *   for await (const msg of query({ prompt, options: { hooks } })) { ... }
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import { createAuditHook } from "./lib/audit-hook.js";
import { z } from "zod";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

// --- Simulated dev tools ---

const readFile = tool(
  "read_file",
  "Read a file's contents",
  { path: z.string().describe("File path") },
  async ({ path }) => ({
    content: [
      {
        type: "text" as const,
        text: `Contents of ${path}:\n{"name": "my-app", "version": "1.0.0", "port": 3000}`,
      },
    ],
  })
);

const writeFile = tool(
  "write_file",
  "Write content to a file",
  {
    path: z.string().describe("File path"),
    content: z.string().describe("Content to write"),
  },
  async ({ path, content }) => ({
    content: [
      {
        type: "text" as const,
        text: `Wrote ${content.length} chars to ${path}`,
      },
    ],
  })
);

const runCommand = tool(
  "run_command",
  "Run a shell command and return output",
  { command: z.string().describe("Shell command to execute") },
  async ({ command }) => ({
    content: [
      {
        type: "text" as const,
        text: `$ ${command}\n{"name": "my-app", "version": "1.0.0", "port": 3000, "debug": true}`,
      },
    ],
  })
);

const devTools = createSdkMcpServer({
  name: "dev-tools",
  tools: [readFile, writeFile, runCommand],
});

type ContentBlock = { type: string; text?: string; name?: string };

async function main() {
  console.log("=== Audit Logging: Automatic Tool Call Trail ===\n");

  const db = new DialogueDB();
  const auditLog = await db.createDialogue({
    label: "audit-log",
    tags: ["audit"],
  });
  console.log(`Audit dialogue: ${auditLog.id}\n`);

  // One line to enable audit logging
  const hooks = createAuditHook(auditLog);

  const prompt =
    "Read the file 'config.json', then write an updated version to " +
    "'config.new.json' with a new 'debug: true' field added, " +
    "then run 'cat config.new.json' to verify the result.";

  console.log(`Prompt: ${prompt}\n`);

  for await (const message of query({
    prompt,
    options: {
      model: "haiku",
      maxTurns: 8,
      mcpServers: { "dev-tools": devTools },
      hooks,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content as ContentBlock[]) {
        if (block.type === "tool_use") console.log(`  [tool] ${block.name}`);
        if (block.type === "text" && block.text) {
          console.log(`  [agent] ${block.text.slice(0, 120)}`);
        }
      }
    }
    if (message.type === "result" && !message.is_error) {
      console.log(
        `\nDone. ${(message as { num_turns: number }).num_turns} turns.\n`
      );
    }
  }

  // --- Query the audit log ---
  console.log("--- Audit Log (from DialogueDB) ---\n");

  await auditLog.loadMessages({ order: "asc" });
  console.log(`Total audit entries: ${auditLog.messages.length}\n`);

  for (const entry of auditLog.messages) {
    const data = entry.content as Record<string, unknown>;
    const inputStr = JSON.stringify(data.input).slice(0, 80);
    const outputStr = String(data.output).slice(0, 60);
    console.log(`  [${data.timestamp}] ${data.tool}`);
    console.log(`    input:  ${inputStr}`);
    console.log(`    output: ${outputStr}`);
    console.log();
  }

  // Filter by tool name using tags
  const writeEntries = auditLog.messages.filter((m) =>
    m.tags.includes("write_file")
  );
  console.log(`Entries for 'write_file': ${writeEntries.length}`);

  const readEntries = auditLog.messages.filter((m) =>
    m.tags.includes("read_file")
  );
  console.log(`Entries for 'read_file': ${readEntries.length}`);

  // Cleanup
  await db.deleteDialogue(auditLog.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
