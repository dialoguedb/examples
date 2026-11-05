# DialogueDB + TanStack AI

Use [TanStack AI](https://tanstack.com/ai) for provider-agnostic chat and [DialogueDB](https://dialoguedb.com) for conversation persistence. Swap the adapter (OpenAI → Anthropic → Gemini) without changing your storage code.

## What it does

1. Creates a conversation in DialogueDB
2. Chats with GPT via TanStack AI's `chat()` + `streamToText()`
3. Persists every message to DialogueDB
4. Simulates a cold restart — loads the conversation fresh
5. Continues chatting — the model has full context from before the restart

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Run

```bash
npm run hello-world
```

## Why TanStack AI + DialogueDB?

**TanStack AI** gives you a unified `chat()` function that works across providers. Switch from `openaiText('gpt-4o-mini')` to `anthropicText('claude-sonnet-4-20250514')` in one line — your conversation loop, streaming, and tool handling stay the same.

**DialogueDB** gives you persistent conversation storage. Messages survive server restarts, deployments, and cold starts. Load a conversation by ID and pick up where you left off.

Together, they let you build provider-agnostic chat applications with durable memory.

## Project structure

```
src/
  hello-world.ts   # Chat, cold restart, resume
```
