/**
 * DialogueDB MCP Server
 *
 * Exposes DialogueDB as tools over the Model Context Protocol (MCP).
 * Any MCP-compatible client — Claude Desktop, Cursor, VS Code Copilot,
 * Windsurf, etc. — can manage persistent conversations through this server.
 *
 * Tools:
 *   create_dialogue  — Start a new conversation
 *   list_dialogues   — List stored conversations
 *   get_messages     — Retrieve messages from a conversation
 *   add_message      — Append a message to a conversation
 *   save_state       — Store structured state on a conversation
 *   delete_dialogue  — Remove a conversation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();

const server = new McpServer({
  name: "dialoguedb",
  version: "1.0.0",
});

// -- Tools ----------------------------------------------------------------

server.registerTool(
  "create_dialogue",
  {
    description:
      "Create a new DialogueDB conversation. Returns the dialogue ID.",
    inputSchema: {
      label: z.string().optional().describe("Human-readable label"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for filtering / grouping"),
    },
  },
  async ({ label, tags }) => {
    const dialogue = await db.createDialogue({ label, tags });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { id: dialogue.id, label: dialogue.label, tags: dialogue.tags },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "list_dialogues",
  {
    description:
      "List conversations stored in DialogueDB. Returns IDs, labels, and tags.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max dialogues to return (default 20)"),
    },
  },
  async ({ limit }) => {
    const result = await db.listDialogues({ limit: limit ?? 20 });
    const items = result.items.map((d) => ({
      id: d.id,
      label: d.label,
      tags: d.tags,
      totalMessages: d.totalMessages,
      created: d.created,
    }));
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(items, null, 2) },
      ],
    };
  }
);

server.registerTool(
  "get_messages",
  {
    description:
      "Retrieve messages from a DialogueDB conversation, ordered oldest-first.",
    inputSchema: {
      dialogueId: z.string().describe("The dialogue ID"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max messages to return (default 50)"),
    },
  },
  async ({ dialogueId, limit }) => {
    const dialogue = await db.getDialogue(dialogueId);
    if (!dialogue) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Dialogue not found: ${dialogueId}`,
          },
        ],
        isError: true,
      };
    }
    await dialogue.loadMessages({ order: "asc", limit: limit ?? 50 });
    const messages = dialogue.messages.map((m) => ({
      role: m.role,
      content: m.content,
      metadata: m.metadata,
    }));
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(messages, null, 2) },
      ],
    };
  }
);

server.registerTool(
  "add_message",
  {
    description:
      "Add a message to a DialogueDB conversation. Use role 'user' or 'assistant'.",
    inputSchema: {
      dialogueId: z.string().describe("The dialogue ID"),
      role: z.enum(["user", "assistant"]).describe("Message role"),
      content: z.string().describe("Message content"),
    },
  },
  async ({ dialogueId, role, content }) => {
    const dialogue = await db.getDialogue(dialogueId);
    if (!dialogue) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Dialogue not found: ${dialogueId}`,
          },
        ],
        isError: true,
      };
    }
    const message = await dialogue.saveMessage({ role, content });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { id: message.id, role: message.role, saved: true },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "save_state",
  {
    description:
      "Save structured state (JSON) on a DialogueDB conversation. Useful for tracking topics, user preferences, or workflow progress.",
    inputSchema: {
      dialogueId: z.string().describe("The dialogue ID"),
      state: z
        .record(z.unknown())
        .describe("Arbitrary JSON state to persist"),
    },
  },
  async ({ dialogueId, state }) => {
    const dialogue = await db.getDialogue(dialogueId);
    if (!dialogue) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Dialogue not found: ${dialogueId}`,
          },
        ],
        isError: true,
      };
    }
    await dialogue.saveState(state);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ dialogueId, stateSaved: true }, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "delete_dialogue",
  {
    description: "Permanently delete a DialogueDB conversation.",
    inputSchema: {
      dialogueId: z.string().describe("The dialogue ID to delete"),
    },
  },
  async ({ dialogueId }) => {
    await db.deleteDialogue(dialogueId);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ dialogueId, deleted: true }, null, 2),
        },
      ],
    };
  }
);

// -- Start ----------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DialogueDB MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
