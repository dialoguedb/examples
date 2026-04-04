# DialogueDB + Cohere SDK

Persistent conversations with [Cohere's](https://cohere.com/) Command R+ model using the [v2 Chat API](https://docs.cohere.com/reference/chat) and [DialogueDB](https://dialoguedb.com) for storage.

## What it does

- **hello-world** — Chat with Command R+, persist every message to DialogueDB, simulate a cold restart, and prove the model picks up right where it left off.
- **advanced** — Full agent loop with tool calling (weather lookup, math, note-taking). Every message — including tool calls and results — is persisted. Resume the conversation from a completely separate process.

## Why DialogueDB + Cohere

Cohere's chat API is stateless — you pass the full message history on every request. DialogueDB gives you durable storage for that history so conversations survive process restarts, server redeployments, and horizontal scaling without any local state.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set environment variables** (copy `.env.example` → `.env`):
   ```
   DIALOGUEDB_API_KEY=your-dialoguedb-key
   DIALOGUEDB_ENDPOINT=your-dialoguedb-endpoint
   COHERE_API_KEY=your-cohere-key
   ```

   Get a DialogueDB key at [dialoguedb.com](https://dialoguedb.com). Get a Cohere key at [dashboard.cohere.com](https://dashboard.cohere.com/api-keys).

## Run

```bash
# Simple conversation with cold restart
npm run hello-world

# Multi-tool agent loop with cold resume
npm run advanced

# Or run invocations separately (two different processes)
npm run advanced:1
DIALOGUE_ID=<id-from-step-1> npm run advanced:2
```

## Key patterns

### Saving messages
```typescript
await dialogue.saveMessage({ role: "user", content: "Hello!" });
```

### Loading after restart
```typescript
const dialogue = await db.getDialogue(dialogueId);
await dialogue.loadMessages({ order: "asc" });
// Pass dialogue.messages to Cohere — full context restored
```

### Persisting tool calls
Tool calls and results are stored as objects in DialogueDB's `content` field (which accepts `string | object | array`), so you can reconstruct the exact Cohere message format on reload.
