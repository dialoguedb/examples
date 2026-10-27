# DialogueDB + Express + OpenAI — End-to-End Chatbot

A complete chatbot API built with [Express](https://expressjs.com), [OpenAI](https://platform.openai.com/docs), and [DialogueDB](https://dialoguedb.com). Shows the full loop that every AI chat backend needs: receive a message, load history, call the LLM, store the response, return it.

**Why this matters:** OpenAI's Chat Completions API is stateless — every request needs the full message history. Most tutorials skip the persistence layer or use an in-memory Map that dies on restart. This example uses DialogueDB so conversations survive restarts, scale across servers, and become searchable.

> **Also see:** [`../openai-sdk/`](../openai-sdk/) for standalone OpenAI SDK integration, [`../hono/`](../hono/) for the same pattern with Hono + Claude.

## What it covers

- **The full chat loop** — receive message → store in DialogueDB → load history → send to OpenAI → store response → return to client
- **Multi-user isolation** — namespace-scoped conversations so each user's chats are separate
- **Semantic search** — find relevant messages across all conversations with a natural language query
- **Persistence** — conversations survive process restarts, deployments, and cold starts

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- A [DialogueDB](https://dialoguedb.com) API key and endpoint
- An [OpenAI](https://platform.openai.com) API key

## Quick Demo

Runs the full flow in-process — two users chatting, namespace isolation, semantic search:

```bash
npm run demo
```

## Run as a Server

```bash
npm run dev
```

Then use curl or any HTTP client:

```bash
# Create a chat (with optional namespace for multi-user isolation)
curl -X POST http://localhost:3000/chats \
  -H "Content-Type: application/json" \
  -d '{"label": "my-chat", "namespace": "user:alice", "systemPrompt": "You are a helpful assistant."}'

# Send a message (returns AI response)
curl -X POST http://localhost:3000/chats/<chat-id>/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the capital of France?"}'

# Get chat history
curl http://localhost:3000/chats/<chat-id>/messages

# List all chats (optionally filter by namespace)
curl http://localhost:3000/chats
curl "http://localhost:3000/chats?namespace=user:alice"

# Semantic search across all conversations
curl "http://localhost:3000/search?q=travel+recommendations&limit=5"

# Delete a chat
curl -X DELETE http://localhost:3000/chats/<chat-id>
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/chats` | Create a new chat. Body: `{ label?, namespace?, systemPrompt? }` |
| `GET` | `/chats` | List chats. Query: `?namespace=user:alice` |
| `GET` | `/chats/:id/messages` | Get full message history |
| `POST` | `/chats/:id/messages` | Send a message, get AI response. Body: `{ message }` |
| `GET` | `/search` | Semantic search. Query: `?q=your+query&limit=5` |
| `DELETE` | `/chats/:id` | Delete a chat and all messages |

## How DialogueDB Fits In

```
Client → Express → DialogueDB (save user message)
                 → DialogueDB (load history)
                 → OpenAI     (generate response)
                 → DialogueDB (save assistant response)
       ← Express ← response
```

Every message is persisted the moment it arrives. If the server crashes between saving the user message and getting the OpenAI response, the user's message is safe. On restart, `loadMessages()` picks up right where things left off.

## Namespaces for Multi-User Isolation

Pass a `namespace` when creating a chat to scope it to a specific user:

```bash
# Alice's chats
curl -X POST http://localhost:3000/chats \
  -d '{"namespace": "user:alice", "label": "alice-chat"}'

# Bob's chats
curl -X POST http://localhost:3000/chats \
  -d '{"namespace": "user:bob", "label": "bob-chat"}'

# List only Alice's chats
curl "http://localhost:3000/chats?namespace=user:alice"
```

No extra database tables, no user-scoped queries to write — DialogueDB handles the isolation.
