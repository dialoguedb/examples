# Full-Stack Chatbot with DialogueDB + OpenAI

A complete chatbot application with an Express API server, browser-based chat UI, and persistent conversation memory powered by DialogueDB.

**What this demonstrates:**

- The full chatbot loop: receive message → store in DialogueDB → load history → send to OpenAI → store response → return to client
- Conversation persistence that survives server restarts
- Multi-user isolation using DialogueDB tags
- Managing multiple conversations per user

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Fill in your keys:

   - `DIALOGUEDB_API_KEY` — from [dialoguedb.com](https://dialoguedb.com)
   - `DIALOGUEDB_ENDPOINT` — your DialogueDB endpoint
   - `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com)

3. **Start the server:**

   ```bash
   npm run dev
   ```

4. **Open your browser** to [http://localhost:3000](http://localhost:3000) and start chatting.

## Try It

1. Send a few messages — the assistant responds using OpenAI with full conversation context
2. **Refresh the page** — your conversation is still there (loaded from DialogueDB)
3. **Restart the server** — your conversation still persists
4. **Change the user ID** — you get a separate, isolated conversation history
5. Click **+ New Chat** to start a fresh conversation under the same user

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send a message, get an AI response |
| `GET` | `/api/history/:dialogueId` | Load conversation history |
| `GET` | `/api/conversations?userId=x` | List a user's conversations |
| `DELETE` | `/api/conversations/:dialogueId` | Delete a conversation |

### Example: Send a message

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "message": "What is photosynthesis?"}'
```

Response:

```json
{
  "reply": "Photosynthesis is the process by which plants convert sunlight...",
  "dialogueId": "01ABC..."
}
```

### Example: Continue the conversation

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"dialogueId": "01ABC...", "userId": "alice", "message": "How efficient is it?"}'
```

The assistant has full context from the previous messages — all loaded from DialogueDB.

## How It Works

```
Browser                    Express Server              DialogueDB         OpenAI
  |                             |                          |                |
  |-- POST /api/chat ---------->|                          |                |
  |                             |-- saveMessage(user) ---->|                |
  |                             |-- loadMessages() ------->|                |
  |                             |<--- conversation history-|                |
  |                             |-- chat.completions ------|--------------->|
  |                             |<--- AI response ---------|----------------|
  |                             |-- saveMessage(asst) ---->|                |
  |<--- { reply, dialogueId } --|                          |                |
```

Each conversation is tagged with the user ID, so `listDialogues` filtered by tag gives per-user isolation without any extra infrastructure.
