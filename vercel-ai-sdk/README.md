# DialogueDB + Vercel AI SDK Examples

Three examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions using the [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` package) — the most popular TypeScript AI SDK for building chat apps, agents, and AI-powered features.

> **Also see:** [`../anthropic-sdk/`](../anthropic-sdk/) for the raw Anthropic Messages API, or [`../anthropic-agent-sdk/`](../anthropic-agent-sdk/) for the Claude Agent SDK.

## Why Vercel AI SDK + DialogueDB?

The Vercel AI SDK handles model calls, streaming, and tool execution beautifully — but conversations live in memory. When your server restarts, deploys, or scales, they're gone. DialogueDB adds cross-process persistence with two lines: `saveMessage` after each exchange, `loadMessages` to restore.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest proof of concept. Creates a conversation, chats with Claude via `generateText`, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Claude retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages via `generateText`, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Claude remembers everything from before the restart

## Tool Calling

Full tool integration using Vercel AI SDK's Zod-based tool definitions and `maxSteps` for automatic tool execution, with every step persisted to DialogueDB.

```bash
npm run tool-calling                         # Run both invocations back-to-back
npm run tool-calling -- --invocation=1       # Run only invocation 1
npm run tool-calling -- --invocation=2       # Run only invocation 2 (needs DIALOGUE_ID)
```

**What it demonstrates:**
- Define tools with Zod schemas (the Vercel AI SDK way)
- `maxSteps` auto-executes tools — no manual loop needed
- Persist user messages, assistant responses, and tool usage metadata
- **Cold resume**: load the full conversation from DialogueDB in a new process, continue with full context

### Running as separate processes

```bash
# Terminal 1
npm run tool-calling -- --invocation=1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run tool-calling -- --invocation=2
```

## Streaming

Shows the pattern for real-time streaming with persistence — stream tokens to the client as they arrive, then persist the complete response to DialogueDB once the stream finishes.

```bash
npm run streaming
```

**What it demonstrates:**
- `streamText` for real-time token-by-token output
- Persist the full response after the stream completes (not during — you don't want partial messages in your DB)
- Cold restart and continue a streamed conversation
- Track token usage metadata alongside messages

This is the exact pattern you'd use in a Next.js API route or Express handler: stream to the client, persist to DialogueDB on completion.

## Project Structure

```
src/
  hello-world.ts      # Simplest generateText + DialogueDB example
  tool-calling.ts     # Zod tools + maxSteps + cold resume
  streaming.ts        # streamText + persist-on-completion pattern
```

## The Pattern

Every example follows the same two-step integration:

```typescript
// After getting a response from the AI SDK
await dialogue.saveMessage({ role: "assistant", content: result.text });

// To restore a conversation (new process, new server, etc.)
const dialogue = await db.getDialogue(dialogueId);
await dialogue.loadMessages({ order: "asc" });
const messages = toCoreMessages(dialogue); // → CoreMessage[]
```

That's it. The Vercel AI SDK handles the model calls; DialogueDB handles the memory.
