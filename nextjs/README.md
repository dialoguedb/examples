# DialogueDB + Next.js — Chat with Persistent History

A full-stack chat app using [Next.js](https://nextjs.org) API Route Handlers, [DialogueDB](https://dialoguedb.com) for conversation persistence, and GPT for AI responses.

**Why this matters:** Next.js API routes are stateless — each request runs in isolation with no shared memory. DialogueDB stores every message server-side, so conversations survive deployments, cold starts, and serverless function recycling. No database schema, no Redis, no session cookies.

> **Also see:** [`../hono/`](../hono/) for a lightweight REST API, [`../openai-sdk/`](../openai-sdk/) for direct OpenAI SDK usage.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to chat in the browser.

## API Endpoints

All endpoints live at `/api/chat`:

| Method | Params | Description |
|---|---|---|
| `POST` | Body: `{ message, dialogueId? }` | Send a message, get AI response. Omit `dialogueId` to start a new conversation. |
| `GET` | Query: `?dialogueId=...` | Retrieve full message history |
| `DELETE` | Query: `?dialogueId=...` | Delete a conversation |

### curl Examples

```bash
# Start a new conversation
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! What can you help me with?"}'
# Returns: { "dialogueId": "...", "role": "assistant", "content": "..." }

# Continue the conversation (use the dialogueId from above)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me more about that.", "dialogueId": "<id>"}'

# Get conversation history
curl "http://localhost:3000/api/chat?dialogueId=<id>"

# Delete the conversation
curl -X DELETE "http://localhost:3000/api/chat?dialogueId=<id>"
```

## How DialogueDB Fits In

The API route handler follows this flow on every message:

1. **Load or create** a dialogue — `db.getDialogue(id)` or `db.createDialogue()`
2. **Load history** — `dialogue.loadMessages()` fetches all prior messages
3. **Save user message** — `dialogue.saveMessage({ role: "user", ... })`
4. **Call GPT** with the full history from DialogueDB
5. **Save assistant response** — `dialogue.saveMessage({ role: "assistant", ... })`

Every message is stored in DialogueDB. Restart the server, redeploy, or scale to multiple instances — the conversation picks up where it left off.

## Project Structure

```
nextjs/
├── src/app/
│   ├── api/chat/route.ts   ← API route: chat endpoint with DialogueDB + OpenAI
│   ├── layout.tsx           ← Root layout
│   └── page.tsx             ← Chat UI
├── next-env.d.ts
├── package.json
└── tsconfig.json
```
