# How to Add Persistent Conversation Memory to the Anthropic SDK

Every Anthropic tutorial starts the same way:

```typescript
const messages = [];
```

An array. In memory. The entire conversation state of your AI application, living in a variable that vanishes the moment your process stops.

It works fine for a demo. It falls apart everywhere else.

## The Problem Nobody Talks About

What happens when your Lambda cold starts? When you push a deploy?

Your users lose their conversations. Every message, every piece of context, every tool result — gone. The user comes back, types "as I was saying...", and Claude has no idea what they're talking about.

This isn't a hypothetical. If you're building anything beyond a single-session chatbot, you need conversation persistence. And the Anthropic SDK doesn't provide it. That's not a criticism — it's a messaging API, not a database. But it means the persistence layer is your problem.

Most teams solve this by bolting on a database, writing serialization logic for the Anthropic message format (including `tool_use` and `tool_result` blocks, which aren't simple strings), building a loading layer that reconstructs the messages array for API calls, and maintaining all of it as the API evolves. It takes weeks to get right and months to harden.

## DialogueDB: Managed Persistence for AI Conversations

DialogueDB is a managed database purpose-built for AI conversation storage. Instead of building your own persistence layer, you get an SDK that works alongside the Anthropic SDK:

```bash
npm install dialogue-db @anthropic-ai/sdk
```

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { DialogueDB, setGlobalConfig } from "dialogue-db";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
});

const anthropic = new Anthropic();
const db = new DialogueDB();
```

Two SDKs. One for AI, one for persistence. They don't depend on each other — they compose.

## The Hello World Pattern

The simplest proof: create a conversation, chat with Claude, simulate a cold restart, and continue chatting with full context.

### Step 1: Create a Conversation and Chat

```typescript
const dialogue = await db.createDialogue({ label: "hello-world-demo" });

// Save the user message and get Claude's response
await dialogue.saveMessage({
  role: "user",
  content: "Hi! My name is Alice and I'm building a weather app for surfers.",
});

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  })),
});

// Save Claude's response
const text = response.content
  .filter((b): b is Anthropic.TextBlock => b.type === "text")
  .map((b) => b.text)
  .join("");
await dialogue.saveMessage({ role: "assistant", content: text });
```

Every message is persisted as it happens. No batching, no flush. It's in the database.

### Step 2: Simulate a Cold Restart

```typescript
// New process. New memory. Zero local state.
const resumed = await db.getDialogue(dialogue.id);
await resumed.loadMessages({ order: "asc" });
console.log(`Loaded ${resumed.messages.length} messages from DialogueDB`);
```

This is what happens after a Lambda cold start, a server restart, or a crash. You load the dialogue by ID and get every message back.

### Step 3: Continue the Conversation

```typescript
await resumed.saveMessage({
  role: "user",
  content: "Quick recap: what's my name, what am I building, and what features did we discuss?",
});

const followUp = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: resumed.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  })),
});
```

Claude gets the full message history. It knows the user's name is Alice, they're building a surfer weather app, and it remembers what APIs were discussed. Context preserved across a complete process boundary.

## The Advanced Pattern: Tool Loops, Token Tracking, and Prompt Caching

Real applications use tools. The Anthropic Messages API supports `tool_use` and `tool_result` content blocks, and these need to be persisted too — not just text messages.

### Persisting a Tool Loop

```typescript
async function agentLoop(dialogue: Dialogue, userMessage: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const messages = dialogue.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as Anthropic.MessageParam["content"],
    }));

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Save the assistant's response with token metadata
    await dialogue.saveMessage({
      role: "assistant",
      content: response.content as Anthropic.MessageParam["content"],
      metadata: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });

    if (response.stop_reason === "end_turn") {
      return extractText(response);
    }

    // Handle and persist tool results
    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = toolBlocks.map((block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: executeTool(block.name, block.input as Record<string, unknown>),
      }));

      // Tool results are persisted as a user message — exactly matching Anthropic's format
      await dialogue.saveMessage({
        role: "user",
        content: toolResults as Anthropic.MessageParam["content"],
      });
    }
  }
}
```

The key insight: DialogueDB stores content as-is. `tool_use` blocks, `tool_result` blocks, text blocks — they all persist without serialization hacks. When you load the dialogue later, the messages are already in the format the Anthropic API expects.

### Token Tracking via Metadata

Every message in DialogueDB supports arbitrary metadata. Use it to track token usage:

```typescript
await dialogue.saveMessage({
  role: "assistant",
  content: response.content,
  metadata: {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  },
});

// Later: sum up token usage across the conversation
function sumTokens(dialogue: Dialogue) {
  let input = 0, output = 0;
  for (const m of dialogue.messages) {
    if (m.metadata?.input_tokens) input += Number(m.metadata.input_tokens);
    if (m.metadata?.output_tokens) output += Number(m.metadata.output_tokens);
  }
  return { input, output };
}
```

### Prompt Caching for Efficient Resumes

When resuming a conversation, you can add `cache_control` hints to avoid re-processing the entire conversation prefix:

```typescript
function toAnthropicMessagesWithCache(dialogue: Dialogue): AnthropicMessage[] {
  const messages = toAnthropicMessages(dialogue);

  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    if (typeof last.content === "string") {
      last.content = [
        {
          type: "text",
          text: last.content,
          cache_control: { type: "ephemeral" },
        },
      ];
    } else if (Array.isArray(last.content)) {
      const lastBlock = last.content[last.content.length - 1];
      lastBlock.cache_control = { type: "ephemeral" };
    }
  }

  return messages;
}
```

Mark the last message in the persisted history with a cache hint. Anthropic caches the prefix, and your resumed conversation only pays for the new tokens. You can track cache hits in metadata too:

```typescript
await dialogue.saveMessage({
  role: "assistant",
  content: response.content,
  metadata: {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
  },
});
```

## Multi-Process Workflows

The advanced example can run as two separate processes sharing a dialogue:

```bash
# Terminal 1: Run the initial conversation
npm run advanced:1
# Prints: DIALOGUE_ID=abc-123

# Terminal 2: Resume from a completely separate process
DIALOGUE_ID=abc-123 npm run advanced:2
```

This is the real test. Two separate Node processes, potentially on different machines, sharing the same conversation. Invocation 1 runs a multi-tool agent loop and persists everything. Invocation 2 loads it cold, adds prompt cache hints, and continues seamlessly.

This pattern maps directly to real architectures: an API server handling one turn, a background worker handling the next, a cron job checking in later — all reading from and writing to the same dialogue.

## What You Get

- **Zero-config persistence**: `saveMessage()` and `loadMessages()`. That's it.
- **Format preservation**: `tool_use`, `tool_result`, text blocks — stored and loaded in Anthropic's native format.
- **Metadata**: Track tokens, costs, latency, or anything else alongside messages.
- **State management**: `saveState()` for conversation-level state (separate from messages).
- **Multi-process**: Share dialogues across Lambda invocations, servers, workers.
- **Prompt caching**: Cache-friendly resume patterns that cut costs on long conversations.

## Try It

```bash
git clone https://github.com/dialogue-db/examples
cd examples/anthropic-sdk
npm install
cp .env.example .env
# Add your keys to .env

npm run hello-world    # Simple persistence demo
npm run advanced       # Tool loops, caching, multi-process
```

DialogueDB handles the persistence so you can focus on what your AI actually does. Stop rebuilding conversation storage from scratch.

[Get started at dialoguedb.com](https://dialoguedb.com)
