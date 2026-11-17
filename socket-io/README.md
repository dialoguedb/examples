# DialogueDB + Socket.IO

Real-time WebSocket chat with persistent conversation memory. Every message — user and AI — is stored in [DialogueDB](https://dialoguedb.com). When a client reconnects (browser refresh, network drop, new device), the full conversation history is restored instantly.

Uses [Socket.IO](https://socket.io) for real-time communication and [OpenAI](https://openai.com) for AI responses.

## Why this matters

WebSocket connections are ephemeral — a page refresh wipes the conversation. DialogueDB solves this by persisting every message server-side. The reconnecting client gets its full history from DialogueDB, not from an in-memory cache that dies with the process.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Run the demo

```bash
npm run demo
```

The demo starts the server in-process, connects two client sessions (simulating a disconnect and reconnect), and proves that the full conversation survives the reconnection.

## Run the server standalone

```bash
npm run dev
```

Starts the Socket.IO server on port 3000 (or `PORT` env var). Connect your own client using the events below.

## Socket.IO Events

**Client → Server:**

| Event     | Payload          | Description                |
| --------- | ---------------- | -------------------------- |
| `join`    | `{ dialogueId }` | Join/resume a conversation |
| `message` | `{ text }`       | Send a user message        |

**Server → Client:**

| Event     | Payload            | Description                      |
| --------- | ------------------ | -------------------------------- |
| `history` | `[{ role, text }]` | Full chat history (sent on join) |
| `reply`   | `{ role, text }`   | AI response to your message      |
| `error`   | `string`           | Error description                |

## What it demonstrates

- **Real-time messaging** — Socket.IO handles the WebSocket transport
- **Persistent history** — Every message is saved to DialogueDB as it happens
- **Cold reconnection** — A new client joining the same `dialogueId` gets full history
- **Context across sessions** — GPT retains context from messages sent by previous connections

## Project Structure

```
src/
  persist.ts   — Bridge between DialogueDB messages and OpenAI format
  server.ts    — Socket.IO server with DialogueDB + OpenAI
  demo.ts      — End-to-end demo proving persistence across reconnections
```
