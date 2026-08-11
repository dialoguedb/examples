# DialogueDB MCP Server

An [MCP](https://modelcontextprotocol.io/) server that exposes [DialogueDB](https://dialoguedb.com) as tools. Any MCP-compatible client — Claude Desktop, Cursor, VS Code Copilot, Windsurf, Claude Code — can create, read, and manage persistent conversations through natural language.

## Why?

MCP lets AI assistants call external tools. This server turns DialogueDB into a set of tools that any MCP client can use:

- **Claude Desktop** can save and resume conversations across sessions
- **Cursor / VS Code Copilot** can persist coding context between projects
- **Any MCP client** gets conversation persistence without writing integration code

## Tools

| Tool | Description |
|------|-------------|
| `create_dialogue` | Start a new conversation (optional label and tags) |
| `list_dialogues` | List stored conversations |
| `get_messages` | Retrieve messages from a conversation |
| `add_message` | Append a user or assistant message |
| `save_state` | Store structured JSON state on a conversation |
| `delete_dialogue` | Remove a conversation |

## Setup

```bash
npm install
cp .env.example .env
# Add your DialogueDB API key and endpoint to .env
npm run build
```

## Usage with Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "dialoguedb": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/build/server.js"],
      "env": {
        "DIALOGUEDB_API_KEY": "your-api-key",
        "DIALOGUEDB_ENDPOINT": "your-endpoint"
      }
    }
  }
}
```

Restart Claude Desktop. You can now ask Claude to create dialogues, save messages, and retrieve conversation history — all persisted in DialogueDB.

## Usage with Claude Code

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "dialoguedb": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/build/server.js"],
      "env": {
        "DIALOGUEDB_API_KEY": "your-api-key",
        "DIALOGUEDB_ENDPOINT": "your-endpoint"
      }
    }
  }
}
```

## Development

Run the server directly with tsx during development:

```bash
npx tsx src/server.ts
```

The server communicates over stdio using JSON-RPC, so you won't see output in the terminal — connect an MCP client to interact with it.
