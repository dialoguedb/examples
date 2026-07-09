# WebSocket Chat — DialogueDB + ws + OpenAI

A real-time chat server using raw WebSockets. Every conversation persists in DialogueDB, so clients can disconnect and reconnect without losing context — even across server restarts.

## What it does

- Opens a WebSocket server that accepts chat connections
- Each connection gets a DialogueDB-backed conversation
- User messages are sent to OpenAI with full conversation history
- Clients can resume any conversation by passing its dialogue ID
- The `/delete` command cleans up when you're done

## Why you'd want this

If you're building a real-time chat application (customer support, team chat, AI assistants), you need conversations to survive disconnections, server deployments, and process crashes. DialogueDB handles the persistence layer so you don't need a database schema or migration system — just connect and chat.

## Prerequisites

- Node.js 18+
- A [DialogueDB](https://dialoguedb.com) API key
- An [OpenAI](https://platform.openai.com) API key

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment file and add your keys:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your API keys.

## Usage

Start the server:

```bash
npm run server
```

In another terminal, start the client:

```bash
npm run client
```

Chat interactively. When you're done, type `/quit` to disconnect (conversation is saved), or `/delete` to remove it from DialogueDB.

### Resume a conversation

The client prints a dialogue ID when it connects. Use it to resume later:

```bash
npm run client -- <dialogueId>
```

Your full conversation history loads automatically and the AI retains all prior context.

## How it works

```
Client                    Server                   DialogueDB        OpenAI
  │                         │                          │                │
  │── ws connect ──────────>│                          │                │
  │                         │── createDialogue ───────>│                │
  │<── connected {id} ─────│                          │                │
  │                         │                          │                │
  │── {type: message} ────>│                          │                │
  │                         │── saveMessage (user) ───>│                │
  │                         │── chat completions ─────────────────────>│
  │                         │<─────────── response ──────────────────│
  │                         │── saveMessage (ai) ────>│                │
  │<── {type: response} ───│                          │                │
  │                         │                          │                │
  │── disconnect ──────────>│  (dialogue persists)     │                │
  │                         │                          │                │
  │── ws connect ?id=xxx ──>│                          │                │
  │                         │── getDialogue ──────────>│                │
  │                         │── loadMessages ─────────>│                │
  │<── connected {history} ─│                          │                │
```

## WebSocket protocol

**Client → Server:**

```jsonc
{ "type": "message", "text": "Hello!" }  // send a chat message
{ "type": "delete" }                      // delete the conversation
```

**Server → Client:**

```jsonc
{ "type": "connected", "dialogueId": "...", "history": [...] }  // on connect
{ "type": "response", "text": "Hi there!" }                     // AI reply
{ "type": "deleted" }                                            // cleanup confirmed
{ "type": "error", "text": "..." }                               // error
```

Any WebSocket client (browser, Postman, wscat) can connect — the included CLI client is just for convenience.
