# Telegram Bot with DialogueDB

A Telegram bot powered by Claude that remembers conversations using DialogueDB. Each chat gets its own persistent dialogue — the bot recalls prior context even after restarts.

## Why DialogueDB?

Telegram bots typically lose conversation context when they restart, or resort to fragile local file storage. DialogueDB gives you:

- **Per-chat memory** — each private or group chat is stored as a separate dialogue
- **Survives restarts** — full history is loaded from DialogueDB, not RAM
- **Searchable metadata** — every message is tagged with the Telegram user who sent it
- **Token tracking** — usage metadata is stored alongside each response

## How it works

1. User sends a message (private chat) or mentions the bot (group chat)
2. Bot loads (or creates) a DialogueDB dialogue tagged with the chat ID
3. Conversation history is sent to Claude as context
4. Claude's response is persisted and sent back to Telegram

## Setup

### 1. Create a Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token BotFather gives you

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your Telegram bot token, Anthropic API key, and DialogueDB credentials
```

### 3. Install and run

```bash
npm install
npm start
```

### 4. Chat

Send a direct message to your bot, or add it to a group and mention it by username:

> @YourBot what's the capital of France?

It will respond — and remember the conversation next time you ask.

## Project structure

```
telegram-bot/
├── src/
│   └── bot.ts          # Bot with DialogueDB persistence
├── .env.example        # Required environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Key patterns

**Per-chat dialogue lookup** — dialogues are tagged with `chat:<id>` so each conversation gets isolated memory:

```typescript
const list = await db.listDialogues();
const existing = list.items.find((d) =>
  d.tags?.includes(`chat:${chatId}`)
);
```

**Rich metadata on every message** — who said it, when, and token costs:

```typescript
await dialogue.saveMessage({
  role: "user",
  content: text,
  metadata: { telegramUser: username },
  tags: [`user:${userId}`],
});
```
