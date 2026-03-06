# Anthropic Messages API — Integration Guide

Persist conversations from the Anthropic Messages API using DialogueDB. This guide covers setup, core patterns, and advanced features like tool loop persistence, token tracking, and prompt caching.

## Prerequisites

- Node.js 18+
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- A DialogueDB API key ([dialoguedb.com](https://dialoguedb.com))

## Installation

```bash
npm install dialogue-db @anthropic-ai/sdk
```

## Quick Start

### 1. Configure Both SDKs

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const anthropic = new Anthropic();
const db = new DialogueDB();
```

### 2. Create a Dialogue and Save Messages

```typescript
const dialogue = await db.createDialogue({ label: "my-conversation" });

// Save user message
await dialogue.saveMessage({
  role: "user",
  content: "Hi! My name is Alice.",
});

// Call Claude
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  })),
});

// Save assistant response
const text = response.content
  .filter((b): b is Anthropic.TextBlock => b.type === "text")
  .map((b) => b.text)
  .join("");
await dialogue.saveMessage({ role: "assistant", content: text });
```

### 3. Load and Resume a Conversation

```typescript
// Later — new process, new Lambda, new server
const resumed = await db.getDialogue(dialogueId);
if (!resumed) throw new Error("Dialogue not found");

await resumed.loadMessages({ order: "asc" });

// Messages are ready — reconstruct for the Anthropic API
const messages = resumed.messages.map((m) => ({
  role: m.role as "user" | "assistant",
  content: m.content as string,
}));

// Continue the conversation
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages,
});
```

## Core Patterns

### Saving Messages

Messages are saved immediately — no batching, no flush required:

```typescript
// Text messages
await dialogue.saveMessage({ role: "user", content: "Hello" });
await dialogue.saveMessage({ role: "assistant", content: "Hi there!" });
```

### Loading Message History

```typescript
await dialogue.loadMessages({ order: "asc" });

// Access loaded messages
console.log(dialogue.messages.length);
console.log(dialogue.messages[0].role);
console.log(dialogue.messages[0].content);
```

### Reconstructing Messages for the API

A helper to convert DialogueDB messages to the Anthropic format:

```typescript
function toAnthropicMessages(dialogue: Dialogue): Anthropic.MessageParam[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as Anthropic.MessageParam["content"],
  }));
}
```

This works for both simple text messages and complex content blocks (`tool_use`, `tool_result`). DialogueDB preserves the content structure as-is.

### Conversation State

Track conversation-level state separately from messages:

```typescript
// Save state
await dialogue.saveState({
  invocation: 1,
  completed: true,
  totalMessages: dialogue.messages.length,
});

// State is loaded with the dialogue
const state = dialogue.state;
```

## Advanced: Tool Loop Persistence

When using tools with the Messages API, you implement a manual loop. DialogueDB persists every step — including `tool_use` and `tool_result` blocks.

### The Agent Loop Pattern

```typescript
async function agentLoop(dialogue: Dialogue, userMessage: string): Promise<string> {
  await dialogue.saveMessage({ role: "user", content: userMessage });

  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages: toAnthropicMessages(dialogue),
    });

    // Persist the assistant turn with token metadata
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

    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = toolBlocks.map(
        (block) => ({
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: executeTool(block.name, block.input as Record<string, unknown>),
        })
      );

      // Persist tool results
      await dialogue.saveMessage({
        role: "user",
        content: toolResults as Anthropic.MessageParam["content"],
      });
    }
  }
}
```

### Content Format

DialogueDB stores content in the same format the Anthropic API expects:

| Message type | `role` | `content` format |
|---|---|---|
| User text | `"user"` | `string` |
| Assistant text | `"assistant"` | `string` or `TextBlock[]` |
| Assistant tool call | `"assistant"` | `[TextBlock, ToolUseBlock, ...]` |
| Tool results | `"user"` | `ToolResultBlockParam[]` |

No serialization or transformation needed when loading messages back for API calls.

## Advanced: Token Tracking with Metadata

Use message metadata to track token usage per message:

```typescript
await dialogue.saveMessage({
  role: "assistant",
  content: response.content,
  metadata: {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  },
});
```

Aggregate across a conversation:

```typescript
function sumTokens(dialogue: Dialogue) {
  let input = 0, output = 0;
  for (const m of dialogue.messages) {
    if (m.metadata?.input_tokens) input += Number(m.metadata.input_tokens);
    if (m.metadata?.output_tokens) output += Number(m.metadata.output_tokens);
  }
  return { input, output };
}
```

## Advanced: Prompt Caching

When resuming a conversation, use Anthropic's prompt caching to avoid re-processing the full history. Add a `cache_control` hint to the last message in the conversation prefix:

```typescript
function toAnthropicMessagesWithCache(dialogue: Dialogue): Anthropic.MessageParam[] {
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
      const lastBlock = last.content[last.content.length - 1] as Record<string, unknown>;
      lastBlock.cache_control = { type: "ephemeral" };
    }
  }

  return messages;
}
```

Use it when calling the API from a resumed dialogue:

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  system: [
    {
      type: "text",
      text: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ],
  tools,
  messages: toAnthropicMessagesWithCache(dialogue),
});
```

Track cache performance in metadata:

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

DialogueDB dialogues can be shared across processes. A common pattern: one process writes, another reads and continues.

```bash
# Process 1: Run the conversation, get a dialogue ID
npm run advanced:1
# Output: DIALOGUE_ID=abc-123

# Process 2: Resume from the saved dialogue
DIALOGUE_ID=abc-123 npm run advanced:2
```

In code:

```typescript
// Process 1
const dialogue = await db.createDialogue({ label: "shared-workflow" });
await agentLoop(dialogue, "Check the weather in SF and Tokyo");
console.log(`DIALOGUE_ID=${dialogue.id}`);

// Process 2 (separate invocation, possibly different machine)
const dialogueId = process.env.DIALOGUE_ID;
const dialogue = await db.getDialogue(dialogueId);
await dialogue.loadMessages({ order: "asc" });
// Continue from where process 1 left off
```

This maps to real architectures: API server handles one turn, background worker handles the next, cron job checks in later.

## API Reference

### DialogueDB

```typescript
const db = new DialogueDB();

db.createDialogue({ label?, state?, tags? })  // Create a new dialogue
db.getDialogue(id)                             // Load a dialogue by ID
db.listDialogues()                             // List all dialogues
db.deleteDialogue(id)                          // Delete a dialogue
```

### Dialogue

```typescript
dialogue.id                    // Dialogue ID
dialogue.messages              // Loaded messages (readonly)
dialogue.state                 // Conversation state

dialogue.saveMessage({         // Save a message
  role,
  content,
  metadata?,
  tags?
})

dialogue.loadMessages({        // Load message history
  order: "asc" | "desc"
})

dialogue.saveState(state)      // Save conversation-level state
```

## Environment Variables

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...              # Anthropic (auto-read by SDK)
DIALOGUEDB_API_KEY=your-dialoguedb-key    # DialogueDB
DIALOGUEDB_ENDPOINT=https://api.dialoguedb.com
```

## Examples

See the full working examples in this directory:

- **`src/hello-world.ts`** — Create, chat, cold restart, resume
- **`src/advanced.ts`** — Tool loop, token tracking, prompt caching, multi-process
- **`src/tools.ts`** — Tool definitions for the advanced example
