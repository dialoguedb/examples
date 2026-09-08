/**
 * MCP Server — DialogueDB Conversation Memory
 *
 * An MCP server that exposes DialogueDB as tools, giving any
 * MCP-compatible AI client persistent conversation memory.
 *
 * Works with: Claude Desktop, VS Code Copilot, Cursor, Windsurf,
 * and any other MCP-compatible client.
 *
 * Transport: stdio (launched as a child process by the client)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DialogueDB } from "dialogue-db";
import "dotenv/config";
import { z } from "zod";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const db = new DialogueDB({ apiKey: requireEnv("DIALOGUE_DB_API_KEY") });

const server = new McpServer({
  name: "dialoguedb",
  version: "1.0.0",
});

// -----------------------------------------------------------------------
// Tools
// -----------------------------------------------------------------------

server.tool(
  "create_dialogue",
  "Create a new conversation thread in DialogueDB",
  {
    label: z.string().optional().describe("Human-readable label for the dialogue"),
    tags: z.array(z.string()).optional().describe("Tags for organization and filtering"),
  },
  async ({ label, tags }) => {
    const dialogue = await db.createDialogue({
      ...(label ? { label } : {}),
      ...(tags ? { tags } : {}),
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ id: dialogue.id, label: label ?? null }, null, 2) }],
    };
  },
);

server.tool(
  "save_message",
  "Save a message to an existing dialogue",
  {
    dialogueId: z.string().describe("The dialogue ID to save the message to"),
    role: z.enum(["user", "assistant", "system"]).describe("Message role"),
    content: z.string().describe("Message content"),
  },
  async ({ dialogueId, role, content }) => {
    const dialogue = await db.getDialogue(dialogueId);
    if (!dialogue) {
      return {
        content: [{ type: "text", text: `Dialogue not found: ${dialogueId}` }],
        isError: true,
      };
    }
    const message = await dialogue.saveMessage({ role, content });
    return {
      content: [{ type: "text", text: JSON.stringify({ id: message.id, role, saved: true }, null, 2) }],
    };
  },
);

server.tool(
  "get_messages",
  "Retrieve messages from a dialogue in chronological order",
  {
    dialogueId: z.string().describe("The dialogue ID to retrieve messages from"),
  },
  async ({ dialogueId }) => {
    const dialogue = await db.getDialogue(dialogueId);
    if (!dialogue) {
      return {
        content: [{ type: "text", text: `Dialogue not found: ${dialogueId}` }],
        isError: true,
      };
    }
    await dialogue.loadMessages({ order: "asc" });
    const messages = dialogue.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created: m.created,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(messages, null, 2) }],
    };
  },
);

server.tool(
  "list_dialogues",
  "List existing dialogues with their IDs, labels, and message counts",
  {},
  async () => {
    const { items } = await db.listDialogues();
    const dialogues = items.map((d) => ({
      id: d.id,
      label: d.label,
      status: d.status,
      totalMessages: d.totalMessages,
      created: d.created,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(dialogues, null, 2) }],
    };
  },
);

server.tool(
  "search_messages",
  "Semantic search across all dialogues for relevant messages",
  {
    query: z.string().describe("Natural language search query"),
    limit: z.number().optional().describe("Max results to return (default: 10)"),
  },
  async ({ query, limit }) => {
    const response = await db.searchMessages(query, { limit: limit ?? 10 });
    const results = response.results.map((r) => ({
      relevance: r.relevance,
      role: r.item.role,
      content: r.item.content,
      created: r.item.created,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  },
);

server.tool(
  "delete_dialogue",
  "Permanently delete a dialogue and all its messages",
  {
    dialogueId: z.string().describe("The dialogue ID to delete"),
  },
  async ({ dialogueId }) => {
    await db.deleteDialogue(dialogueId);
    return {
      content: [{ type: "text", text: JSON.stringify({ id: dialogueId, deleted: true }, null, 2) }],
    };
  },
);

// -----------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
