# DialogueDB + GraphQL Yoga

A GraphQL API for AI-powered chat, using [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) for the schema layer and [DialogueDB](https://dialoguedb.com) for conversation persistence.

## Why GraphQL for chat?

- **Schema-first**: your chat API is self-documenting — clients know exactly what they can query
- **Flexible queries**: fetch just the fields you need (message content without metadata, or vice versa)
- **Semantic search as a query**: DialogueDB's meaning-based search maps naturally to a GraphQL query field
- **Built-in playground**: GraphiQL lets you explore the API interactively

## What it does

- `createChat` / `deleteChat` — manage conversations stored in DialogueDB
- `sendMessage` — sends a message, gets an AI response from Claude, persists both
- `chats` / `messages` — query conversation history (survives restarts)
- `search` — semantic search across all stored messages

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in your API keys:
   - `DIALOGUEDB_API_KEY` — from [dialoguedb.com](https://dialoguedb.com)
   - `DIALOGUEDB_ENDPOINT` — your DialogueDB endpoint
   - `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)

3. **Run the server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:4000/graphql](http://localhost:4000/graphql) for the GraphiQL playground.

4. **Or run the demo** (no server needed — exercises everything end-to-end)

   ```bash
   npm run demo
   ```

## Example queries

Create a chat:

```graphql
mutation {
  createChat(label: "travel-planning", systemPrompt: "You are a travel guide.") {
    id
    label
  }
}
```

Send a message and get an AI response:

```graphql
mutation {
  sendMessage(chatId: "<id>", message: "What should I see in Tokyo?") {
    role
    content
  }
}
```

Semantic search across all conversations:

```graphql
query {
  search(query: "restaurant recommendations", limit: 5) {
    relevance
    message {
      role
      content
    }
  }
}
```

Load chat history:

```graphql
query {
  messages(chatId: "<id>") {
    role
    content
    created
  }
}
```
