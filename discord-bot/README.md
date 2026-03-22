# Discord Bot with DialogueDB

A Discord bot powered by Claude that remembers conversations using DialogueDB. Each channel gets its own persistent dialogue — the bot recalls prior context even after restarts.

## Why DialogueDB?

Discord bots typically lose conversation context when they restart, or resort to fragile local file storage. DialogueDB gives you:

- **Per-channel memory** — each channel's conversation is stored as a separate dialogue
- **Survives restarts** — full history is loaded from DialogueDB, not RAM
- **Searchable metadata** — every message is tagged with the Discord user who sent it
- **Token tracking** — usage metadata is stored alongside each response

## How it works

1. User `@mentions` the bot in a Discord channel
2. Bot loads (or creates) a DialogueDB dialogue tagged with the channel ID
3. Conversation history is sent to Claude as context
4. Claude's response is persisted and sent back to Discord

## Setup

### 1. Create a Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → Bot → copy the token
3. Enable **Message Content Intent** under Bot → Privileged Gateway Intents
4. Invite the bot to your server with the OAuth2 URL Generator (scopes: `bot`, permissions: `Send Messages`, `Read Message History`)

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your Discord token, Anthropic API key, and DialogueDB credentials
```

### 3. Install and run

```bash
npm install
npm start
```

### 4. Chat

Mention the bot in any channel:

> @YourBot what's the capital of France?

It will respond — and remember the conversation next time you ask.

## Project structure

```
discord-bot/
├── src/
│   └── bot.ts          # Bot with DialogueDB persistence
├── .env.example        # Required environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Key patterns

**Per-channel dialogue lookup** — dialogues are tagged with `channel:<id>` so each channel gets isolated memory:

```typescript
const list = await db.listDialogues();
const existing = list.items.find((d) =>
  d.tags?.includes(`channel:${channelId}`)
);
```

**Rich metadata on every message** — who said it, when, and token costs:

```typescript
await dialogue.saveMessage({
  role: "user",
  content: query,
  metadata: { discordUser: message.author.username },
  tags: [`user:${message.author.id}`],
});
```
