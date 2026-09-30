# DialogueDB + NestJS

A NestJS REST API for AI-powered conversations with persistent history. Uses NestJS dependency injection to wrap DialogueDB in a clean service layer, so conversation memory is available across controllers, workers, and microservices.

## Why DialogueDB with NestJS

NestJS applications are stateless by design — instances scale horizontally and restart freely. DialogueDB gives your chat features durable, queryable conversation storage without managing your own database:

| Without DialogueDB | With DialogueDB |
|---|---|
| Conversations lost on restart | Persisted automatically |
| Manual DB schema for messages | Zero schema setup |
| Build your own history loading | `dialogue.loadMessages()` |
| No cross-instance memory | Shared across all instances |

## Setup

1. **Get API keys**
   - [DialogueDB](https://dialoguedb.com) — create an account and grab your API key
   - [OpenAI](https://platform.openai.com) — for GPT responses

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Fill in your API keys
   ```

3. **Install and run**
   ```bash
   npm install
   ```

## Quick Demo

Run the demo script — no HTTP server needed. It boots the NestJS DI container, creates a chat, sends messages, simulates a cold restart, and proves the conversation survives:

```bash
npm run demo
```

## Run as Server

```bash
npm start
```

Then use the API:

```bash
# Create a chat
curl -s -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"systemPrompt": "You are a helpful coding assistant."}' | jq

# Send a message
curl -s -X POST http://localhost:3000/chat/<ID>/messages \
  -H 'Content-Type: application/json' \
  -d '{"message": "How do I reverse a string in TypeScript?"}' | jq

# Get chat history
curl -s http://localhost:3000/chat/<ID>/messages | jq

# Delete a chat
curl -s -X DELETE http://localhost:3000/chat/<ID> | jq
```

## Project Structure

```
src/
├── main.ts                  # Bootstrap + DialogueDB config
├── app.module.ts            # Root module
├── demo.ts                  # Standalone demo script
└── chat/
    ├── chat.module.ts       # Feature module
    ├── chat.controller.ts   # REST endpoints
    └── chat.service.ts      # DialogueDB + OpenAI integration
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | Create a new chat (optional `systemPrompt` in body) |
| `POST` | `/chat/:id/messages` | Send a message, get AI response |
| `GET` | `/chat/:id/messages` | Get full message history |
| `DELETE` | `/chat/:id` | Delete a chat and its messages |

## Key Patterns

- **Service-layer integration**: `ChatService` is injectable — use it in controllers, WebSocket gateways, CRON jobs, or microservice handlers
- **System prompts in state**: Stored in `dialogue.state`, so they persist across restarts without a separate config store
- **Token tracking**: Every assistant response saves `model` and `usage` in message metadata for cost monitoring
- **Cold restart proof**: The demo script tears down and recreates the NestJS context to prove conversations survive
