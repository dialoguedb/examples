# DialogueDB + Socket.io — Real-time AI Chat

A WebSocket chat server powered by [Socket.io](https://socket.io) where every conversation is persisted to [DialogueDB](https://dialoguedb.com). Clients that reconnect get full history replayed, and the AI picks up right where it left off — across restarts, deploys, and cold starts.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Running

Start the server in one terminal, then connect with the client in another:

```bash
# Terminal 1 — start the chat server
npm run server

# Terminal 2 — start a new conversation
npm run client
```

Chat for a while, then quit the client (`/quit` or Ctrl+C). To resume the same conversation later, pass the dialogue ID that was printed when you connected:

```bash
# Terminal 2 — resume an existing conversation
npm run client -- <dialogue-id>
```

The client replays the full conversation history from DialogueDB, and the AI retains full context from before the disconnect.

## What it demonstrates

- **Real-time persistence** — every message is saved to DialogueDB the instant it's sent, not batched at the end
- **Reconnection with full history** — clients joining an existing dialogue get all prior messages replayed via a `history` event
- **Cross-restart continuity** — stop the server, restart it, reconnect the client with the same dialogue ID — nothing is lost
- **Event-driven architecture** — Socket.io's bidirectional events (`join`, `message`, `reply`) map naturally to DialogueDB's save/load pattern

## Socket.io events

| Direction        | Event        | Payload                              | Description                  |
| ---------------- | ------------ | ------------------------------------ | ---------------------------- |
| client → server  | `join`       | `{ dialogueId?: string }`           | Join or create a dialogue    |
| client → server  | `message`    | `{ content: string }`               | Send a chat message          |
| server → client  | `history`    | `{ dialogueId, messages[] }`        | Full history on join         |
| server → client  | `reply`      | `{ role: "assistant", content }`    | AI response                  |
| server → client  | `chat_error` | `{ message: string }`               | Error details                |

## Why Socket.io + DialogueDB?

Socket.io gives you real-time bidirectional communication, but conversations live only in memory — they're gone when the server restarts. DialogueDB gives you:

- **Persistent history** — conversations survive server restarts, deploys, and crashes
- **Instant replay** — reconnecting clients get the full conversation without re-asking the AI
- **Cross-service access** — any service can read the conversation via the DialogueDB API
- **Metadata and search** — tag, filter, and query conversations across your entire application
