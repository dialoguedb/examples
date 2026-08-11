# DialogueDB + Express — Chat API Server

A REST API for AI-powered conversations with persistent history. [Express](https://expressjs.com) handles routing and middleware, [DialogueDB](https://dialoguedb.com) stores the conversation history, and Claude provides the AI responses.

**Why this matters:** Most Express chat backends use in-memory storage or a hand-rolled database schema. DialogueDB gives you persistent, queryable conversation storage with zero schema setup — so Express handles HTTP and DialogueDB handles state.

> **Also see:** [`../hono/`](../hono/) for a Hono-based variant, [`../anthropic-sdk/`](../anthropic-sdk/) for direct Claude API integration.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Quick Demo

Runs two Express server instances in-process to demonstrate persistence across cold restarts:

```bash
npm run demo
```

The demo:
1. Starts an Express server, creates a chat with a custom system prompt
2. Has a multi-turn conversation with Claude
3. Stops the server and starts a fresh Express instance (cold restart)
4. Proves chats and message history survived the restart
5. Continues the conversation — Claude has full context from before

## Run as a Server

```bash
npm run dev
```

Then use curl or any HTTP client:

```bash
# Create a chat
curl -X POST http://localhost:3000/chats \
  -H "Content-Type: application/json" \
  -d '{"label": "my-chat", "systemPrompt": "You are a helpful assistant."}'

# Send a message (returns AI response)
curl -X POST http://localhost:3000/chats/<chat-id>/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! What can you help me with?"}'

# Get chat history
curl http://localhost:3000/chats/<chat-id>/messages

# List all chats
curl http://localhost:3000/chats

# Delete a chat
curl -X DELETE http://localhost:3000/chats/<chat-id>
```

## How DialogueDB Fits In

| Concern | Without DialogueDB | With DialogueDB |
|---|---|---|
| Chat storage | In-memory Map or custom DB schema | `db.createDialogue()` — done |
| Message persistence | Lost on restart | Survives restarts, deployments, cold starts |
| History loading | Manual SQL/ORM queries | `dialogue.loadMessages({ order: "asc" })` |
| System prompt storage | Env var or config file | Stored in dialogue state, per-chat |
| Multi-server | Shared DB required | Built-in — every instance reads the same data |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/chats` | Create a new chat. Body: `{ label?, systemPrompt? }` |
| `GET` | `/chats` | List all chats |
| `GET` | `/chats/:id/messages` | Get full message history |
| `POST` | `/chats/:id/messages` | Send a message, get AI response. Body: `{ message }` |
| `DELETE` | `/chats/:id` | Delete a chat and all messages |
