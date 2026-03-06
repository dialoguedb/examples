/**
 * Multi-Agent Tracking — Solving the Research Agent's logging problem
 *
 * Anthropic's research-agent has a SubagentTracker that logs to local JSONL
 * files in logs/session_YYYYMMDD/. Lost when the process ends. No cross-session
 * querying.
 *
 * This example shows DialogueAgentTracker with threaded dialogues:
 *   - Parent dialogue = main session
 *   - Each subagent = threaded child dialogue (via threadOf)
 *   - Tool calls = messages with structured metadata
 *   - After the run: query by agent, by tool, by time — from any service
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { setGlobalConfig } from "dialogue-db";
import { DialogueAgentTracker } from "./lib/agent-tracker.js";
import { z } from "zod";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

// --- Simulated research tools ---

const searchWeb = tool(
  "search_web",
  "Search the web for information on a topic",
  { query: z.string().describe("Search query") },
  async ({ query: q }) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          results: [
            { title: `${q} — Overview`, snippet: `Key findings about ${q}...` },
            { title: `${q} — Analysis`, snippet: `Detailed analysis of ${q}...` },
          ],
        }),
      },
    ],
  })
);

const analyzeData = tool(
  "analyze_data",
  "Analyze and compare data points",
  {
    data: z.string().describe("Data to analyze"),
    metric: z.string().describe("Metric to compute (e.g., popularity, momentum)"),
  },
  async ({ data, metric }) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          analysis: { data, metric, result: `${metric} analysis complete`, score: 0.78 },
        }),
      },
    ],
  })
);

const researchTools = createSdkMcpServer({
  name: "research-tools",
  tools: [searchWeb, analyzeData],
});

type ContentBlock = { type: string; text?: string; name?: string };

function extractText(content: unknown[]): string {
  return (content as ContentBlock[])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("");
}

async function main() {
  console.log("=== Multi-Agent Tracking: Threaded Dialogues ===\n");

  const tracker = new DialogueAgentTracker();
  const session = await tracker.createSession("research-session");
  console.log(`Session dialogue: ${session.id}\n`);

  // --- Subagent 1: Researcher ---
  console.log("--- Running subagent: researcher ---\n");

  const researcher = await tracker.registerSubagent("researcher", "research");

  const researchPrompt =
    "Search for information about three AI agent frameworks: " +
    "LangChain, CrewAI, and Anthropic's Agent SDK. " +
    "Use the search_web tool for each one.";

  await researcher.saveMessage({ role: "user", content: researchPrompt });

  let researchFindings = "";
  for await (const message of query({
    prompt: researchPrompt,
    options: {
      model: "haiku",
      maxTurns: 8,
      mcpServers: { "research-tools": researchTools },
      hooks: tracker.createSubagentHooks("researcher"),
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content as ContentBlock[]) {
        if (block.type === "tool_use" && block.name) {
          console.log(`  [researcher/tool] ${block.name}`);
        }
      }
      const text = extractText(message.message.content);
      if (text) {
        researchFindings = text;
        await researcher.saveMessage({ role: "assistant", content: text });
      }
    }
    if (message.type === "result" && !message.is_error) {
      researchFindings =
        researchFindings || (message as { result: string }).result;
      console.log(`  [researcher] Done.\n`);
    }
  }

  await tracker.completeSubagent("researcher", researchFindings.slice(0, 500));

  // --- Subagent 2: Analyst ---
  console.log("--- Running subagent: analyst ---\n");

  const analyst = await tracker.registerSubagent("analyst", "analysis");

  const analysisPrompt =
    "Given these research findings, analyze which AI agent framework " +
    "has the most momentum. Use the analyze_data tool.\n\n" +
    `Research findings:\n${researchFindings.slice(0, 1000)}`;

  await analyst.saveMessage({ role: "user", content: analysisPrompt });

  for await (const message of query({
    prompt: analysisPrompt,
    options: {
      model: "haiku",
      maxTurns: 5,
      mcpServers: { "research-tools": researchTools },
      hooks: tracker.createSubagentHooks("analyst"),
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content as ContentBlock[]) {
        if (block.type === "tool_use" && block.name) {
          console.log(`  [analyst/tool] ${block.name}`);
        }
      }
      const text = extractText(message.message.content);
      if (text) {
        await analyst.saveMessage({ role: "assistant", content: text });
      }
    }
    if (message.type === "result" && !message.is_error) {
      const result = (message as { result: string }).result;
      console.log(`  [analyst] Done.\n`);
      await session.saveMessage({
        role: "assistant",
        content: result,
        tags: ["final-result"],
      });
    }
  }

  await tracker.completeSubagent("analyst");

  // --- Query the tracked data ---
  console.log("--- Session Activity (from DialogueDB) ---\n");

  // Subagent threads
  const subagents = await tracker.getAllSubagents();
  console.log(`Subagent threads: ${subagents.length}`);
  for (const sub of subagents) {
    console.log(`  - ${sub.label} (${sub.id})`);
  }

  // Researcher's tool calls
  const researcherHistory = await tracker.getSubagentHistory("researcher");
  const researcherTools = researcherHistory.filter(
    (m) => m.metadata?.event === "tool_call"
  );
  console.log(`\nResearcher tool calls: ${researcherTools.length}`);
  for (const tc of researcherTools) {
    const data = tc.content as Record<string, unknown>;
    console.log(
      `  ${data.tool}: ${JSON.stringify(data.input).slice(0, 80)}`
    );
  }

  // Analyst's tool calls
  const analystHistory = await tracker.getSubagentHistory("analyst");
  const analystTools = analystHistory.filter(
    (m) => m.metadata?.event === "tool_call"
  );
  console.log(`\nAnalyst tool calls: ${analystTools.length}`);
  for (const tc of analystTools) {
    const data = tc.content as Record<string, unknown>;
    console.log(
      `  ${data.tool}: ${JSON.stringify(data.input).slice(0, 80)}`
    );
  }

  // --- Compare with JSONL approach ---
  console.log("\n--- Comparison ---\n");
  console.log("Their approach (local JSONL files):");
  console.log("  Storage: logs/session_YYYYMMDD/*.jsonl");
  console.log("  After process ends: files on disk, no API access");
  console.log("  Cross-session query: manual file parsing\n");
  console.log("DialogueAgentTracker (DialogueDB):");
  console.log(`  Session: ${session.id}`);
  console.log(`  Subagent threads: ${subagents.length} (threaded dialogues)`);
  console.log(`  Tool calls tracked: ${researcherTools.length + analystTools.length}`);
  console.log("  Queryable: via API from any service, any time\n");

  // Cleanup
  await tracker.cleanup();
  console.log("Cleaned up. Done!");
}

main().catch(console.error);
