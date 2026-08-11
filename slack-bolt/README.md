# Slack Bot with DialogueDB

A Slack bot powered by Claude that uses DialogueDB for per-channel conversation memory. The bot remembers what was discussed in each channel — even across restarts.

## What it does

- **@mention in a channel** — the bot replies with Claude, using the full channel history as context
- **Direct message** — same thing, but in a private 1:1 conversation
- **Persistent memory** — every message is stored in DialogueDB, so the bot picks up where it left off after a restart
- **Per-channel isolation** — each channel gets its own dialogue, keeping conversations separate

## Why DialogueDB

Without DialogueDB, your bot's memory dies when the process restarts. With it, each channel's conversation is persisted and queryable — no database setup, no serialization code, just `saveMessage` and `loadMessages`.

## Setup

### 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under **OAuth & Permissions**, add these bot token scopes:
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
3. Under **Event Subscriptions**, subscribe to:
   - `app_mention`
   - `message.im`
4. Under **Socket Mode**, enable it and generate an app-level token with `connections:write` scope
5. Install the app to your workspace

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:
- `SLACK_BOT_TOKEN` — the `xoxb-` token from OAuth & Permissions
- `SLACK_SIGNING_SECRET` — from Basic Information
- `SLACK_APP_TOKEN` — the `xapp-` token from Socket Mode
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `DIALOGUEDB_API_KEY` and `DIALOGUEDB_ENDPOINT` — from [dialoguedb.com](https://dialoguedb.com)

### 3. Run

```bash
npm install
npm start
```

Mention the bot in a channel or send it a DM.

## How it works

```
User @mentions bot → load channel dialogue from DialogueDB
                   → send history + new message to Claude
                   → persist both messages to DialogueDB
                   → reply in Slack
```

Each channel maps to a DialogueDB dialogue via tags (`channel:<id>`). On every interaction, the bot loads the conversation history, appends the new exchange, and calls Claude with full context. Messages include metadata (Slack user ID, timestamps, token usage) for observability.
