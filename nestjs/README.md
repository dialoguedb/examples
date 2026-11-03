# DialogueDB + NestJS — Chat API Server

A structured REST API for AI-powered conversations using [NestJS](https://nestjs.com) modules, controllers, and dependency injection. [DialogueDB](https://dialoguedb.com) handles conversation persistence, and OpenAI provides the AI responses.

**Why this matters:** NestJS is how teams build production TypeScript backends. This example shows DialogueDB fitting naturally into NestJS's architecture — as an injectable service, not a bolted-on afterthought. Conversations survive restarts, scale across instances, and need zero schema setup.

> **Also see:** [`../hono/`](../hono/) for a lightweight alternative, [`../openai-sdk/`](../openai-sdk/) for direct OpenAI integration without a web framework.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Quick Demo

Runs two server instances in-process to demonstrate persistence across cold restarts:

```bash
npm run demo
```

The demo:
1. Boots a NestJS server, creates a chat with a custom system prompt
2. Has a multi-turn conversation with GPT
3. Shuts down and starts a fresh server (no in-memory state)
4. Proves chats and message history survived the restart
5. Continues the conversation — GPT has full context from before

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

## How It's Structured

```
src/
├── main.ts              — Bootstrap: configures DialogueDB, starts NestJS
├── app.module.ts        — Root module: wires controller + service
├── chat.controller.ts   — HTTP layer: routes, validation, status codes
├── chat.service.ts      — Business logic: DialogueDB + OpenAI integration
└── demo.ts              — Standalone demo proving persistence across restarts
```

DialogueDB lives in `ChatService` as a standard NestJS injectable — no special wiring needed. The controller stays thin (HTTP concerns only), and the service owns all conversation state through DialogueDB.

## How DialogueDB Fits In

| Concern | Without DialogueDB | With DialogueDB |
|---|---|---|
| Chat storage | In-memory Map or custom DB schema | `db.createDialogue()` — done |
| Message persistence | Lost on restart | Survives restarts, deployments, cold starts |
| History loading | Manual SQL/ORM queries | `dialogue.loadMessages({ order: "asc" })` |
| System prompt storage | Env var or config file | Stored in dialogue state, per-chat |
| Multi-instance | Shared DB + cache invalidation | Built-in — every instance reads the same data |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/chats` | Create a new chat. Body: `{ label?, systemPrompt? }` |
| `GET` | `/chats` | List all chats |
| `GET` | `/chats/:id/messages` | Get full message history |
| `POST` | `/chats/:id/messages` | Send a message, get AI response. Body: `{ message }` |
| `DELETE` | `/chats/:id` | Delete a chat and all messages |
