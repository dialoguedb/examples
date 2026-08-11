# Twitch Bot with DialogueDB

A Twitch chatbot powered by OpenAI that remembers conversations using DialogueDB. Each channel gets its own persistent dialogue — the bot recalls prior context even after restarts.

## Why DialogueDB?

Twitch bots typically lose conversation context when they restart. DialogueDB gives you:

- **Per-channel memory** — each Twitch channel's conversation is stored as a separate dialogue
- **Survives restarts** — full history is loaded from DialogueDB, not RAM
- **Searchable metadata** — every message is tagged with the Twitch user who sent it
- **Token tracking** — usage metadata is stored alongside each response

## How it works

1. User types `!ask <question>` in Twitch chat
2. Bot loads (or creates) a DialogueDB dialogue tagged with the channel name
3. Conversation history is sent to GPT as context
4. GPT's response is persisted and sent back to Twitch chat

## Setup

### 1. Create a Twitch bot account

1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Register an application to get a Client ID
3. Generate an OAuth token at [twitchapps.com/tmi](https://twitchapps.com/tmi/) (must start with `oauth:`)

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your Twitch credentials, OpenAI API key, and DialogueDB credentials
```

### 3. Install and run

```bash
npm install
npm start
```

### 4. Chat

Type in any channel the bot has joined:

> !ask what's the best strategy for this game?

The bot will respond — and remember the conversation next time you ask.

## Project structure

```
twitch-bot/
├── src/
│   └── bot.ts          # Bot with DialogueDB persistence
├── .env.example        # Required environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Key patterns

**Per-channel dialogue lookup** — dialogues are tagged with the channel name so each channel gets isolated memory:

```typescript
const list = await db.listDialogues();
const existing = list.items.find((d) =>
  d.tags?.includes(`twitch-channel:${channelName}`)
);
```

**Rich metadata on every message** — who said it and their Twitch status:

```typescript
await dialogue.saveMessage({
  role: "user",
  content: question,
  metadata: {
    twitchUser: userstate["display-name"],
    twitchUserId: userstate["user-id"],
    subscriber: userstate.subscriber,
  },
  tags: [`user:${userstate["user-id"]}`],
});
```
