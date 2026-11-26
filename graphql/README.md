# DialogueDB + GraphQL (Apollo Server)

A type-safe GraphQL API for AI-powered conversations with persistent history. [Apollo Server](https://www.apollographql.com/docs/apollo-server/) handles the GraphQL layer, [DialogueDB](https://dialoguedb.com) stores the conversation history, and GPT provides the AI responses.

**Why GraphQL for a chat API?** REST chat endpoints grow into a tangle of `/chats`, `/chats/:id/messages`, `/chats/:id/search` routes. GraphQL gives clients exactly the fields they need in a single request — fetch a chat's label and its last 10 messages in one query, no over-fetching. DialogueDB backs every resolver, so conversations persist across restarts with no schema to manage.

> **Also see:** [`../hono/`](../hono/) for the same pattern as a REST API, [`../openai-sdk/`](../openai-sdk/) for direct OpenAI SDK integration.

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
1. Creates a chat with a custom system prompt
2. Has a multi-turn conversation with GPT via GraphQL mutations
3. Simulates a cold restart (new Apollo Server instance, no in-memory state)
4. Queries messages from the new server — full history is preserved
5. Continues the conversation — GPT has full context from before

## Run as a Server

```bash
npm run dev
```

Then open [http://localhost:4000](http://localhost:4000) in your browser for Apollo Sandbox, or query with any GraphQL client:

```graphql
# Create a chat
mutation {
  createChat(label: "my-chat", systemPrompt: "You are a helpful assistant.")
  { id label }
}

# Send a message (returns AI response)
mutation {
  sendMessage(chatId: "<id>", message: "Hello! What can you help me with?")
  { role content }
}

# Get chat history
query {
  messages(chatId: "<id>")
  { role content }
}

# List all chats
query { chats { id label } }

# Delete a chat
mutation { deleteChat(id: "<id>") }
```

## How DialogueDB Fits In

The GraphQL schema defines the API surface; DialogueDB provides the storage behind every resolver:

| Resolver | What it does | DialogueDB call |
|---|---|---|
| `createChat` | Start a new conversation | `db.createDialogue({ label, state })` |
| `chats` | List conversations | `db.listDialogues()` |
| `messages` | Load chat history | `dialogue.loadMessages({ order: "asc" })` |
| `sendMessage` | Persist user + assistant messages | `dialogue.saveMessage(...)` (called twice) |
| `deleteChat` | Remove a conversation | `db.deleteDialogue(id)` |

System prompts are stored in dialogue state, not in env vars or config files — each chat can have its own.

## Key File: `schema.ts`

[`src/schema.ts`](src/schema.ts) contains the entire GraphQL-to-DialogueDB bridge:

- `typeDefs` — the GraphQL schema (Chat, Message, queries, mutations)
- `createResolvers(db, openai)` — wires each resolver to DialogueDB and OpenAI

The server and demo both import from this module, keeping the integration in one place.

## Project Structure

```
src/
  schema.ts    # GraphQL type definitions and resolver factory
  server.ts    # Standalone HTTP server (npm run dev)
  demo.ts      # Demo with cold restart proof (npm run demo)
```

## Why DialogueDB for GraphQL?

GraphQL resolvers are stateless functions — they need a data source. DialogueDB is purpose-built for conversation data:

- **No schema migration** — `createDialogue()` and `saveMessage()` handle storage, no tables to design
- **Persistence** — conversations survive restarts, deploys, cold starts
- **Multi-server** — every Apollo Server instance reads the same data
- **Per-chat state** — system prompts, metadata, and custom state stored alongside messages
- **Searchability** — find conversations by label, tags, or content
