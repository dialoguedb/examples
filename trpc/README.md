# DialogueDB + tRPC — Type-Safe Chat API

A type-safe chat API using [tRPC](https://trpc.io) for end-to-end type safety, [DialogueDB](https://dialoguedb.com) for conversation persistence, and OpenAI for AI responses.

**Why this matters:** tRPC gives you full type inference from your router definition all the way to the client — no codegen, no OpenAPI spec, no type drift. DialogueDB gives your conversations persistence that survives restarts, deploys, and cold starts. Together, you get a type-safe chat backend with zero schema boilerplate on either side.

> **Also see:** [`../hono/`](../hono/) for a REST API approach, [`../openai-sdk/`](../openai-sdk/) for direct OpenAI integration.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Quick Demo

Runs the full flow in-process — no HTTP server needed:

```bash
npm run demo
```

The demo:
1. Creates a tRPC router backed by DialogueDB
2. Starts a conversation with a custom system prompt
3. Has a multi-turn conversation with OpenAI
4. Simulates a cold restart (new router instance, no in-memory state)
5. Proves messages survived — loads full history from DialogueDB
6. Continues the conversation with full context
7. Runs a semantic search across stored messages

## Run as an HTTP Server

```bash
npm run server
```

Then connect from any tRPC client:

```typescript
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "./server.js";

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "http://localhost:3000" })],
});

// Full type inference — no codegen needed
const { id } = await client.create.mutate({ label: "my-chat" });
const { reply } = await client.send.mutate({ dialogueId: id, message: "Hello!" });
const history = await client.history.query({ dialogueId: id });
```

## How DialogueDB Fits In

| Concern | Without DialogueDB | With DialogueDB |
|---|---|---|
| Chat storage | In-memory Map or custom DB schema | `db.createDialogue()` — done |
| Message persistence | Lost on restart | Survives restarts, deployments, cold starts |
| History loading | Manual SQL/ORM queries | `dialogue.loadMessages({ order: "asc" })` |
| Semantic search | BYO vector DB + embeddings | `db.searchMessages({ query })` — built in |
| Multi-server | Shared DB required | Built-in — every instance reads the same data |

## API Procedures

| Procedure | Type | Description |
|---|---|---|
| `create` | mutation | Create a new dialogue. Input: `{ label?, systemPrompt? }` |
| `send` | mutation | Send a message, get AI response. Input: `{ dialogueId, message }` |
| `history` | query | Get full message history. Input: `{ dialogueId }` |
| `search` | query | Semantic search across all messages. Input: `{ query, limit? }` |
| `remove` | mutation | Delete a dialogue. Input: `{ dialogueId }` |

## Project Structure

```
src/
  router.ts   # tRPC router with DialogueDB procedures (the reusable part)
  demo.ts     # Self-contained demo using createCaller
  server.ts   # Standalone HTTP server for production use
```
