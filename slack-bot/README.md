# Slack Bot with DialogueDB

A Slack bot powered by Claude that remembers conversations using DialogueDB. Each channel gets its own persistent dialogue — the bot recalls prior context even after restarts.

## Why DialogueDB?

Slack bots typically lose conversation context when they restart. DialogueDB gives you:

- **Per-channel memory** — each channel's conversation is stored as a separate dialogue
- **Survives restarts** — full history is loaded from DialogueDB, not RAM
- **Searchable metadata** — every message is tagged with the Slack user who sent it
- **Token tracking** — usage metadata is stored alongside each response

## How it works

1. User `@mentions` the bot in a channel (or sends a DM)
2. Bot loads (or creates) a DialogueDB dialogue tagged with the channel ID
3. Conversation history is sent to Claude as context
4. Claude's response is persisted and sent back to Slack

## Setup

### 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Under **Socket Mode**, enable it and generate an **App-Level Token** with `connections:write` scope — this is your `SLACK_APP_TOKEN` (starts with `xapp-`)
3. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
4. Under **Event Subscriptions**, enable events and subscribe to:
   - `app_mention`
   - `message.im`
5. Install the app to your workspace — copy the **Bot User OAuth Token** (`xoxb-...`) as `SLACK_BOT_TOKEN`
6. Copy the **Signing Secret** from **Basic Information** as `SLACK_SIGNING_SECRET`

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your Slack tokens, Anthropic API key, and DialogueDB credentials
```

### 3. Install and run

```bash
npm install
npm start
```

### 4. Chat

Mention the bot in any channel:

> @YourBot what's the best way to structure a microservices architecture?

Or DM the bot directly. It will respond — and remember the conversation next time.

## Project structure

```
slack-bot/
├── src/
│   └── bot.ts          # Bot with DialogueDB persistence
├── .env.example        # Required environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Key patterns

**Per-channel dialogue lookup** — dialogues are tagged with `slack-channel:<id>` so each channel gets isolated memory:

```typescript
const list = await db.listDialogues();
const existing = list.items.find((d) =>
  d.tags?.includes(`slack-channel:${channelId}`)
);
```

**Rich metadata on every message** — who said it, when, and token costs:

```typescript
await dialogue.saveMessage({
  role: "user",
  content: query,
  metadata: { slackUser: userId, slackTs: messageTs },
  tags: [`user:${userId}`],
});
```

**Socket Mode** — no public URL needed. The bot connects to Slack over WebSockets, making local development and deployment behind firewalls easy.
