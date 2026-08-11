# DialogueDB + OpenRouter — Model-Agnostic Chat

A multi-turn conversation demo that stores history in [DialogueDB](https://dialoguedb.com) while routing to any LLM through [OpenRouter](https://openrouter.ai). Switch between Claude, GPT-4, Llama, Gemini, and hundreds of other models mid-conversation — DialogueDB keeps the full history intact.

**Why this matters:** Most chat apps hardcode a single LLM provider. When you switch models, you lose conversation context. DialogueDB decouples storage from inference — your conversation history belongs to your app, not your model provider.

> **Also see:** [`../openai-sdk/`](../openai-sdk/) for direct OpenAI integration, [`../anthropic-sdk/`](../anthropic-sdk/) for direct Claude integration.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- A [DialogueDB API key](https://dialoguedb.com) (free tier works)
- An [OpenRouter API key](https://openrouter.ai/keys) (free tier available)

## Run

```bash
npm run demo
```

The demo:
1. Creates a conversation stored in DialogueDB
2. Sends the first two messages through Claude (via OpenRouter)
3. Switches to GPT-4o-mini for the third message — full context is preserved
4. Reloads the conversation from a fresh SDK instance to prove persistence

## How It Works

OpenRouter uses the OpenAI SDK with a different base URL:

```typescript
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

DialogueDB stores every message. When you switch models, the new model sees the entire conversation history loaded from DialogueDB:

```typescript
await dialogue.saveMessage({ role: "user", content: userInput });

// Model A handles turns 1-2
const reply = await chat(dialogue, "anthropic/claude-sonnet-4");
await dialogue.saveMessage({ role: "assistant", content: reply });

// Model B picks up at turn 3 — same history, different model
const reply2 = await chat(dialogue, "openai/gpt-4o-mini");
await dialogue.saveMessage({ role: "assistant", content: reply2 });
```

## How DialogueDB Fits In

| Concern | Without DialogueDB | With DialogueDB |
|---|---|---|
| Model switching | Lose context when changing providers | History is model-agnostic |
| Message storage | Tied to provider's thread/session API | You own your conversation data |
| Multi-model apps | Separate history per provider | One unified history |
| Persistence | In-memory or custom DB schema | `dialogue.saveMessage()` — done |
