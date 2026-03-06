# Social Media Content — DialogueDB + Anthropic Messages API

## Twitter/X

### Thread: The Persistence Problem

**Tweet 1 (hook):**
Every Anthropic tutorial starts with `const messages = []`

An array. In memory.

What happens when your Lambda cold starts? Your server deploys? Your process crashes?

Your users lose their entire conversation.

There's a fix. 🧵

**Tweet 2:**
The problem isn't the Anthropic SDK — it's a messaging API, not a database.

The problem is that persisting AI conversations is harder than it looks:
- tool_use / tool_result blocks aren't simple strings
- message ordering matters
- you need the exact format back for API calls

**Tweet 3:**
We built DialogueDB to solve this. Managed persistence for AI conversations.

The integration is two lines of setup:

```
setGlobalConfig({ apiKey, endpoint });
const db = new DialogueDB();
```

Then `saveMessage()` and `loadMessages()`. That's the whole API.

**Tweet 4:**
Here's what a cold restart looks like:

BEFORE (in-memory):
- Server restarts → messages = [] → context lost

AFTER (DialogueDB):
- Server restarts → loadMessages() → full context restored

Claude remembers everything. Your users never know there was a restart.

**Tweet 5:**
It also handles the hard stuff:
- Tool loops (tool_use + tool_result blocks) persisted in Anthropic's native format
- Token tracking via metadata on each message
- Prompt caching hints for efficient resumes
- Multi-process: two Lambdas sharing one conversation

Full examples: [link]

**Tweet 6:**
We're not replacing the Anthropic SDK. We're the persistence layer that sits next to it.

Two SDKs that compose:
- @anthropic-ai/sdk → AI
- dialogue-db → storage

Try it: dialoguedb.com

---

### Single Tweet: Before/After

Every Anthropic app has this bug:

```
// Before: 🔴
const messages = [];
// server restart → all gone

// After: 🟢
const dialogue = await db.getDialogue(id);
await dialogue.loadMessages({ order: "asc" });
// server restart → full context
```

dialoguedb.com

---

### Single Tweet: The Question

Your AI app's conversations live in `const messages = []`

What happens when:
- Lambda cold starts?
- Server deploys?
- Process crashes?

If the answer is "they're gone" — that's the problem DialogueDB solves.

---

### Single Tweet: Tool Loops

The hardest part of persisting Anthropic conversations isn't the text — it's the tool_use and tool_result blocks.

DialogueDB stores them in the exact format the API expects. Load and replay without serialization hacks.

---

## LinkedIn

### Post: The Conversation Persistence Problem in Production AI

If you're building with the Anthropic SDK (or any LLM API), you've hit this problem: conversation state lives in memory.

Every tutorial shows `const messages = []`. Fine for demos. In production, that array needs to survive Lambda cold starts, server deploys, crashes, and multi-process architectures where different services handle different turns of the same conversation.

Most teams spend weeks building a persistence layer: serializing complex message formats (tool_use, tool_result blocks), loading them back in the exact format the API expects, tracking token usage, managing conversation state.

We built DialogueDB to make this a solved problem.

The integration with the Anthropic SDK is straightforward: `saveMessage()` after each exchange, `loadMessages()` when resuming. Content is stored in the API's native format — no transformation needed when loading back for API calls.

The examples we just open-sourced show two patterns:

1. **Hello World** — Create a conversation, chat with Claude, simulate a cold restart, continue chatting. Claude retains full context.

2. **Advanced** — Full manual tool loop with tool_use/tool_result persistence, token tracking in metadata, prompt caching for efficient resumes, and a multi-process workflow where two separate invocations share a single conversation.

If you're building production AI applications and you're still managing conversation state in memory (or maintaining a custom persistence layer), take a look.

[link to examples]

---

## Dev Community (Hacker News / Reddit)

### Post: Show HN: DialogueDB — Managed conversation persistence for the Anthropic SDK

**Title:** Show HN: DialogueDB – Managed persistence for AI conversations (drop-in for Anthropic SDK)

**Body:**

We've been building AI applications with the Anthropic Messages API and kept running into the same problem: conversation persistence.

The SDK gives you a `messages` array. You send it, you get a response, you append to the array. Works great until your process restarts and the array is gone.

In production this means:
- Lambda cold starts lose conversation context
- Server deploys break in-progress conversations
- Multi-process architectures (API server handles one turn, background worker handles the next) need shared state
- Tool loops with `tool_use` and `tool_result` blocks need to be persisted in the exact format the API expects

We built DialogueDB to solve this. It's a managed database for AI conversations. The integration with the Anthropic SDK is minimal:

```typescript
// Save every message
await dialogue.saveMessage({ role: "user", content: userMessage });
await dialogue.saveMessage({ role: "assistant", content: response.content });

// Resume from anywhere
const dialogue = await db.getDialogue(dialogueId);
await dialogue.loadMessages({ order: "asc" });
// dialogue.messages is ready for the API
```

Key things that make this different from "just use Postgres":
- Content blocks (tool_use, tool_result, text) stored in the API's native format — no serialization layer
- Metadata per message (token usage, latency, whatever you want)
- Conversation-level state management
- Prompt caching patterns for efficient resumes
- Multi-tenant by default

We open-sourced the integration examples: a hello-world that demonstrates cold restart recovery, and an advanced example with a full tool loop, token tracking, prompt caching, and cross-process workflows.

Examples: [link]
Docs: dialoguedb.com

Would love feedback — especially from anyone who's built their own conversation persistence layer and can tell us what we're missing.
