# DialogueDB + Telegraf (Telegram Bot)

A Telegram bot that remembers conversations across restarts using [DialogueDB](https://dialoguedb.com) for persistence and [OpenAI](https://platform.openai.com) for AI responses.

Each Telegram chat (private or group) gets its own DialogueDB dialogue. The bot loads full conversation history before every response, so it maintains context even after deploys, crashes, or cold starts.

## Setup

### 1. Create a Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token

### 2. Install and configure

```bash
npm install
cp .env.example .env
```

Fill in your `.env`:
- `DIALOGUEDB_API_KEY` — from [dialoguedb.com](https://dialoguedb.com)
- `DIALOGUEDB_ENDPOINT` — your DialogueDB endpoint
- `TELEGRAM_BOT_TOKEN` — from BotFather
- `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com)

### 3. Run

```bash
npm start
```

Then message your bot on Telegram.

## Commands

- `/start` — greeting message
- `/clear` — delete conversation history and start fresh

## How it works

1. User sends a message in Telegram
2. Bot loads (or creates) a DialogueDB dialogue for that chat
3. User message is persisted with metadata (username, chat ID)
4. Full conversation history is sent to OpenAI for a response
5. Assistant response is persisted with token usage metadata
6. Reply is sent back to Telegram

The bot survives restarts because all conversation state lives in DialogueDB, not in memory.

## Why DialogueDB?

Without DialogueDB, you'd need to manage your own database schema for messages, handle serialization, and build query logic. DialogueDB gives you:

- **Per-chat persistence** — each Telegram chat maps to a dialogue
- **Cross-restart memory** — conversations survive bot restarts and deploys
- **Metadata tracking** — token usage, usernames, and timestamps stored alongside messages
- **Searchability** — find conversations by tags, labels, or content
- **Zero schema management** — just `saveMessage` and `loadMessages`
