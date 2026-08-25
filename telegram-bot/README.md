# Telegram Bot with DialogueDB

A Telegram bot powered by GPT-4o that remembers conversations using DialogueDB. Each chat gets its own persistent dialogue — the bot recalls prior context even after restarts.

## Why DialogueDB?

Telegram bots typically lose conversation context when they restart. DialogueDB gives you:

- **Per-chat memory** — each Telegram chat (private or group) is stored as a separate dialogue
- **Survives restarts** — full history is loaded from DialogueDB, not RAM
- **Searchable metadata** — every message is tagged with the Telegram user who sent it
- **Token tracking** — OpenAI usage metadata is stored alongside each response

## How it works

1. User sends a message to the bot on Telegram
2. Bot loads (or creates) a DialogueDB dialogue tagged with the chat ID
3. Conversation history is sent to GPT-4o as context
4. GPT's response is persisted and sent back to Telegram

## Setup

### 1. Create a Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token BotFather gives you

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your Telegram bot token, OpenAI API key, and DialogueDB credentials
```

### 3. Install and run

```bash
npm install
npm start
```

### 4. Chat

Open your bot in Telegram and send it a message. It will respond — and remember the conversation next time you ask.

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

**Per-chat dialogue lookup** — dialogues are tagged with `chat:<id>` so each Telegram chat gets isolated memory:

```typescript
const tag = `chat:${chatId}`;
const list = await db.listDialogues();
const existing = list.items.find((d) => d.tags?.includes(tag));
```

**Rich metadata on every message** — who said it and token costs:

```typescript
await dialogue.saveMessage({
  role: "user",
  content: text,
  metadata: { telegramUser: username, chatId },
  tags: [`user:${username}`],
});
```
