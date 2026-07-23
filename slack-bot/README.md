# Slack Bot with DialogueDB

A Slack bot powered by Claude that remembers conversations using DialogueDB. Each channel gets its own persistent dialogue — the bot recalls prior context even after restarts.

Uses [Socket Mode](https://api.slack.com/apis/socket-mode) for easy local development (no public URL required).

## Why DialogueDB?

Slack bots typically lose conversation context when they restart, or resort to fragile local file storage. DialogueDB gives you:

- **Per-channel memory** — each channel's conversation is stored as a separate dialogue
- **Survives restarts** — full history is loaded from DialogueDB, not RAM
- **Searchable metadata** — every message is tagged with the Slack user who sent it
- **Token tracking** — usage metadata is stored alongside each response

## How it works

1. User `@mentions` the bot in a Slack channel
2. Bot loads (or creates) a DialogueDB dialogue tagged with the channel ID
3. Conversation history is sent to Claude as context
4. Claude's response is persisted and replied in a thread

## Setup

### 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**
2. Under **Socket Mode**, enable it and generate an **App-Level Token** with `connections:write` scope — this is your `SLACK_APP_TOKEN` (starts with `xapp-`)
3. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `app_mentions:read`
   - `chat:write`
4. Under **Event Subscriptions**, enable events and subscribe to the `app_mention` bot event
5. **Install to Workspace** — copy the **Bot User OAuth Token** (`xoxb-...`) as your `SLACK_BOT_TOKEN`

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

Invite the bot to a channel, then mention it:

> @YourBot what's the capital of France?

It will respond in a thread — and remember the conversation next time you ask.

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

**Per-channel dialogue lookup** — dialogues are tagged with `channel:<id>` so each channel gets isolated memory:

```typescript
const list = await db.listDialogues();
const existing = list.items.find((d) =>
  d.tags?.includes(`channel:${channelId}`)
);
```

**Rich metadata on every message** — who said it, when, and token costs:

```typescript
const userId = event.user ?? "unknown";
await dialogue.saveMessage({
  role: "user",
  content: query,
  metadata: { slackUser: userId },
  tags: [`user:${userId}`],
});
```

**Thread replies** — responses are posted in threads to keep channels tidy:

```typescript
await say({
  text: assistantText,
  thread_ts: event.thread_ts ?? event.ts,
});
```
