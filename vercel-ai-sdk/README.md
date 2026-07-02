# DialogueDB + Vercel AI SDK

Add conversation persistence to any [Vercel AI SDK](https://ai-sdk.dev) app with two lines of code. The AI SDK abstracts the model provider — [DialogueDB](https://dialoguedb.com) abstracts the storage. Together you get a persistent AI chat that works with OpenAI, Anthropic, Google, or any provider the AI SDK supports, and survives cold restarts, deploys, and process crashes.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need a [DialogueDB](https://dialoguedb.com) API key and an [OpenAI](https://platform.openai.com) API key.

## Run

```bash
npm start          # Run both invocations back-to-back
npm run start:1    # Run only invocation 1 (prints dialogue ID)
npm run start:2    # Run only invocation 2 (needs DIALOGUE_ID env)
```

### What happens

1. **Invocation 1** — Starts a new conversation. The user asks two questions about building a Rust CLI. Each message and response is persisted to DialogueDB.
2. **Invocation 2** — Loads the conversation from scratch (simulating a server restart or new process). Asks the AI to recap — it remembers everything from invocation 1.

### Running as separate processes

```bash
# Terminal 1
npm run start:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run start:2
```

## The integration

The entire DialogueDB integration is this `chat` function:

```typescript
async function chat(dialogue: Dialogue, userMessage: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: toMessages(dialogue),
  });

  await dialogue.saveMessage({ role: "assistant", content: text });
  return text;
}
```

Two `saveMessage` calls. That's it. Your conversation now persists across restarts, scales to any number of users, and is searchable via the DialogueDB API.

## Why DialogueDB + Vercel AI SDK?

The AI SDK's `generateText` and `streamText` are stateless — you pass the full message history every call. DialogueDB gives you:

- **Persistence** — conversations survive restarts, deploys, and cold starts
- **Provider-agnostic** — swap `openai()` for `anthropic()` or `google()`, the persistence code is identical
- **Resume anywhere** — load a conversation by ID from any process, server, or edge function
- **Searchability** — find conversations by label, tags, or content
- **Zero infrastructure** — no database to manage, no schema to maintain
