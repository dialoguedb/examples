# DialogueDB + Vercel AI SDK

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across serverless invocations using the [Vercel AI SDK](https://sdk.vercel.ai/).

The Vercel AI SDK is the most popular framework for building AI-powered apps in Next.js, Nuxt, SvelteKit, and other frameworks. It runs on serverless where every request starts with zero state. DialogueDB gives your conversations a memory that survives cold starts, deploys, and process restarts.

> **Also see:** [`../anthropic-sdk/`](../anthropic-sdk/) for the same integration using the Anthropic SDK directly, or [`../anthropic-agent-sdk/`](../anthropic-agent-sdk/) for the Claude Agent SDK.

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
- Send messages via the Vercel AI SDK's `generateText`
- Load the conversation from scratch (simulating a new serverless invocation)
- Continue the conversation — Claude remembers everything from before the restart

## Tool Agent

Full tool-use agent with automatic multi-step execution via `maxSteps` and cold resume.

```bash
npm run tool-agent
```

**What it demonstrates:**
- Three tools defined with Zod schemas: `get_weather`, `calculate`, `save_note`
- **Invocation 1**: Multi-tool agent — `maxSteps` handles the tool loop automatically, every exchange is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, sends a follow-up with full prior context
- Token usage and tool call metadata tracking

### The serverless pattern

This is the pattern you'd use in a Next.js API route or server action:

```typescript
// app/api/chat/route.ts
import { DialogueDB } from "dialogue-db";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export async function POST(req: Request) {
  const { message, dialogueId } = await req.json();
  const db = new DialogueDB();

  // Load or create the conversation
  let dialogue = dialogueId
    ? await db.getDialogue(dialogueId)
    : await db.createDialogue({ label: "chat" });

  if (dialogueId) await dialogue.loadMessages({ order: "asc" });

  // Persist the user message
  await dialogue.saveMessage({ role: "user", content: message });

  // Generate response with full history
  const messages = dialogue.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    messages,
  });

  // Persist the response
  await dialogue.saveMessage({ role: "assistant", content: text });

  return Response.json({ text, dialogueId: dialogue.id });
}
```

Every request loads the conversation from DialogueDB, generates a response with full context, and persists the result. No in-memory state needed.
