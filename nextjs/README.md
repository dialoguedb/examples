# DialogueDB + Next.js — Chat API Server

A REST API for AI-powered conversations using [Next.js](https://nextjs.org) App Router, [DialogueDB](https://dialoguedb.com) for persistent conversation history, and [OpenAI](https://platform.openai.com) for AI responses.

**Why this matters:** Next.js is where most AI chat apps are built. DialogueDB replaces hand-rolled database schemas and in-memory storage with persistent, queryable conversation history — so your Route Handlers stay focused on logic while DialogueDB handles state across restarts, redeployments, and serverless cold starts.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in your API keys in `.env.local`:

   - `DIALOGUEDB_API_KEY` — from [dialoguedb.com](https://dialoguedb.com)
   - `DIALOGUEDB_ENDPOINT` — defaults to `https://backend.dialoguedb.com`
   - `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com)

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   The server starts at `http://localhost:3000`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Create a new chat |
| `GET` | `/api/chat` | List all chats |
| `POST` | `/api/chat/:id/messages` | Send a message, get AI response |
| `GET` | `/api/chat/:id/messages` | Get message history |
| `DELETE` | `/api/chat/:id` | Delete a chat |

## Usage

```bash
# Create a chat with a custom system prompt
CHAT=$(curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"label": "demo", "systemPrompt": "You are a concise assistant."}')

ID=$(echo $CHAT | jq -r '.id')
echo "Chat ID: $ID"

# Send a message
curl -s -X POST http://localhost:3000/api/chat/$ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "What is DialogueDB?"}' | jq

# Send a follow-up (the LLM sees the full conversation history)
curl -s -X POST http://localhost:3000/api/chat/$ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "How does it handle persistence?"}' | jq

# Get full message history
curl -s http://localhost:3000/api/chat/$ID/messages | jq

# Clean up
curl -s -X DELETE http://localhost:3000/api/chat/$ID | jq
```

## How It Works

The integration is three lines of DialogueDB per request:

1. **Load history** — `dialogue.loadMessages()` retrieves the full conversation
2. **Save user message** — `dialogue.saveMessage({ role: "user", ... })` before calling the LLM
3. **Save AI response** — `dialogue.saveMessage({ role: "assistant", ... })` after the LLM responds

Everything is persisted automatically. Restart the server, redeploy, or scale to multiple instances — the conversation state is always there.

## Project Structure

```
src/
  lib/
    dialoguedb.ts              Shared DialogueDB client (configured once)
  app/
    layout.tsx                 Root layout
    page.tsx                   Landing page with API docs
    api/chat/
      route.ts                 POST: create chat, GET: list chats
      [id]/
        route.ts               DELETE: delete chat
        messages/
          route.ts             POST: send message, GET: get history
```
