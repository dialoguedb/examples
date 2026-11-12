# DialogueDB + tRPC — Type-Safe Chat API

End-to-end type-safe chat procedures with persistent conversation history. [tRPC](https://trpc.io) gives you full TypeScript inference from server to client, [DialogueDB](https://dialoguedb.com) stores the conversations, and [OpenAI](https://platform.openai.com/) provides the AI responses.

**Why this matters:** tRPC eliminates the gap between your API and your client code. When you define a `send` mutation that returns `{ role, content }`, every caller sees that exact type — no OpenAPI codegen, no manual type definitions. Combined with DialogueDB for persistence, you get a type-safe chat backend where conversations survive restarts and the compiler catches integration bugs.

> **Also see:** [`../hono/`](../hono/) for a REST API approach, [`../openai-sdk/`](../openai-sdk/) for direct OpenAI usage.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Quick Demo

Runs a multi-turn conversation using the tRPC router directly (no HTTP server):

```bash
npm run demo
```

The demo:
1. Creates a chat with a custom system prompt
2. Has a multi-turn conversation with GPT
3. Simulates a cold restart (new caller instance, no in-memory state)
4. Proves conversations survived the restart via DialogueDB
5. Continues the conversation — GPT has full context from before

## Run as an HTTP Server

```bash
npm run dev
```

This serves the tRPC router over HTTP using the standalone Node.js adapter. For type-safe client calls, use `@trpc/client`:

```typescript
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "./router.js";

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "http://localhost:3000" })],
});

// Full type inference — no manual types needed
const chat = await client.create.mutate({ label: "my-chat" });
const reply = await client.send.mutate({ chatId: chat.id, message: "Hello!" });
console.log(reply.content); // string — TypeScript knows this
```

## How DialogueDB Fits In

| Concern | Without DialogueDB | With DialogueDB |
|---|---|---|
| Chat storage | In-memory Map or custom DB schema | `db.createDialogue()` — done |
| Message persistence | Lost on restart | Survives restarts, deployments, cold starts |
| History loading | Manual SQL/ORM queries | `dialogue.loadMessages({ order: "asc" })` |
| System prompt storage | Env var or config file | Stored in dialogue state, per-chat |
| Multi-server | Shared DB required | Built-in — every instance reads the same data |

## tRPC Procedures

| Type | Name | Input | Description |
|---|---|---|---|
| mutation | `create` | `{ label?, systemPrompt? }` | Create a new chat |
| query | `list` | — | List all chats |
| query | `history` | `{ chatId }` | Get full message history |
| mutation | `send` | `{ chatId, message }` | Send a message, get AI response |
| mutation | `delete` | `{ chatId }` | Delete a chat and all messages |

## Project Structure

```
src/
  router.ts   — tRPC router with DialogueDB-backed chat procedures
  demo.ts     — In-process demo using createCallerFactory
  server.ts   — Standalone HTTP server (optional)
```
