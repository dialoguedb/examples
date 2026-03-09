# DialogueDB + Vercel AI SDK

Persist AI conversations across serverless invocations, edge functions, and server restarts using [DialogueDB](https://dialoguedb.com) with the [Vercel AI SDK](https://sdk.vercel.ai).

> The Vercel AI SDK is the most popular TypeScript toolkit for building AI apps — used in Next.js, Nuxt, SvelteKit, and standalone Node scripts. DialogueDB gives it persistent memory.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest proof of concept. Creates a conversation, chats with Claude via `generateText`, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — the model retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages via Vercel AI SDK's `generateText`, persist every exchange
- Load the conversation from scratch (simulating a new serverless invocation)
- Continue the conversation — the model remembers everything from before the restart

## Streaming with Tools

Full streaming integration with tool calls and cold resume.

```bash
npm run streaming          # Run both invocations back-to-back
npm run streaming:1        # Run only invocation 1 (prints dialogue ID)
npm run streaming:2        # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- `streamText` with live token output to the console
- Three tools: `get_weather`, `calculate`, `save_note` using Zod schemas
- `maxSteps` for automatic multi-step tool execution
- Every message persisted to DialogueDB with tool call/result metadata
- **Cold resume**: loads the full conversation from DialogueDB, sends a follow-up with full prior context
- Token usage tracking in message metadata

### Running as separate processes

```bash
# Terminal 1
npm run streaming:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run streaming:2
```

## Why DialogueDB + Vercel AI SDK?

The Vercel AI SDK handles the AI provider abstraction beautifully — but conversations are ephemeral. They live in memory and vanish when the process ends. This is fine for a demo, but in production you need:

- **Serverless persistence** — Lambda/Edge functions are stateless; DialogueDB stores the conversation externally
- **Cross-process resume** — pick up any conversation from any server instance
- **Conversation metadata** — track token usage, tool calls, and costs alongside messages
- **Multi-provider support** — switch between Anthropic, OpenAI, Google — DialogueDB stores the conversation regardless of provider
