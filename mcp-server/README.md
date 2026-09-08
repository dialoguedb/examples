# DialogueDB MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that gives any compatible AI client — Claude Desktop, VS Code Copilot, Cursor, Windsurf — persistent conversation memory powered by [DialogueDB](https://dialoguedb.com).

## Why

MCP clients are stateless by default. Each session starts from scratch. This server adds six tools that let an AI assistant create, retrieve, search, and manage conversations stored in DialogueDB, so context survives across sessions, machines, and restarts.

## Tools

| Tool | Description |
|------|-------------|
| `create_dialogue` | Start a new conversation thread |
| `save_message` | Add a message (user, assistant, or system) to a dialogue |
| `get_messages` | Load full message history from a dialogue |
| `list_dialogues` | List all existing dialogues |
| `search_messages` | Semantic search across all conversations |
| `delete_dialogue` | Remove a dialogue and its messages |

## Setup

```bash
npm install
cp .env.example .env
# Add your DialogueDB API key to .env
```

## Usage with Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "dialoguedb": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/absolute/path/to/mcp-server",
      "env": {
        "DIALOGUE_DB_API_KEY": "your-api-key"
      }
    }
  }
}
```

Restart Claude Desktop. The six DialogueDB tools will appear in the tools menu.

## Usage with VS Code / Cursor

Add to your `.vscode/mcp.json` or equivalent MCP config:

```json
{
  "servers": {
    "dialoguedb": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/absolute/path/to/mcp-server",
      "env": {
        "DIALOGUE_DB_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Testing locally

You can also run the server directly to verify it starts:

```bash
npm start
```

The server communicates over stdio (stdin/stdout), so it will appear to hang — that's expected. It's waiting for MCP messages from a client. Press Ctrl+C to stop.

## Project Structure

```
src/
  server.ts   # MCP server with DialogueDB tools (stdio transport)
```
