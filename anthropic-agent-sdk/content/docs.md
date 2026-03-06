# Claude Agent SDK — Integration Guide

Persist agent conversations, track multi-agent sessions, and audit tool calls using DialogueDB with Anthropic's Claude Agent SDK. This guide covers three drop-in patterns with full code examples.

## Prerequisites

- Node.js 18+
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- A DialogueDB API key ([dialoguedb.com](https://dialoguedb.com))

## Installation

```bash
npm install dialogue-db @anthropic-ai/claude-agent-sdk zod
```

## Configuration

```typescript
import { setGlobalConfig } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});
```

Environment variables:

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...              # Anthropic (auto-read by Agent SDK)
DIALOGUEDB_API_KEY=your-dialoguedb-key    # DialogueDB
DIALOGUEDB_ENDPOINT=https://api.dialoguedb.com
```

---

## Pattern 1: Persistent Chat (`DialogueChatStore`)

**Replaces:** The Agent SDK's in-memory `ChatStore` (a `Map` that loses all chats on server restart).

### The Problem

Anthropic's simple-chatapp example uses an in-memory Map:

```typescript
// Their approach — lost on restart
const chats = new Map();
```

### The Solution

`DialogueChatStore` is a drop-in replacement backed by DialogueDB:

```typescript
import { DialogueChatStore } from "./lib/dialogue-store.js";

const store = new DialogueChatStore();
```

### Usage

**Create a chat and add messages:**

```typescript
const chat = await store.createChat("support-conversation");

await store.addMessage(chat.id, "user", "My API key returns 401.");
const reply = await agentReply("My API key returns 401.");
await store.addMessage(chat.id, "assistant", reply);
```

**Survive a restart:**

```typescript
// New process, new store instance — no in-memory state
const newStore = new DialogueChatStore();

// Chats are still there
const chats = await newStore.getAllChats();
// => [{ id: "...", label: "support-conversation" }]

// Messages are still there
const messages = await newStore.getMessages(chat.id);
// => [{ role: "user", content: "My API key..." }, { role: "assistant", content: "..." }]
```

**Continue the conversation:**

```typescript
const history = messages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n");

const reply = await agentReply(resumeMessage,
  `You are continuing a support conversation. Here is the full history:\n\n${history}`
);
await newStore.addMessage(chat.id, "assistant", reply);
```

### Implementation

The full `DialogueChatStore` class (`src/lib/dialogue-store.ts`):

```typescript
import { DialogueDB } from "dialogue-db";
import type { Dialogue, Message } from "dialogue-db";

export class DialogueChatStore {
  private db = new DialogueDB();

  async createChat(label?: string): Promise<Dialogue> {
    return this.db.createDialogue({ label });
  }

  async getChat(id: string): Promise<Dialogue | null> {
    return this.db.getDialogue(id);
  }

  async getAllChats() {
    const { items } = await this.db.listDialogues();
    return items;
  }

  async addMessage(chatId: string, role: string, content: string): Promise<Message> {
    const chat = await this.db.getDialogue(chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    return chat.saveMessage({ role, content });
  }

  async getMessages(chatId: string): Promise<readonly Message[]> {
    const chat = await this.db.getDialogue(chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    await chat.loadMessages({ order: "asc" });
    return chat.messages;
  }

  async deleteChat(id: string): Promise<void> {
    return this.db.deleteDialogue(id);
  }
}
```

---

## Pattern 2: Multi-Agent Tracking (`DialogueAgentTracker`)

**Replaces:** The research-agent's `SubagentTracker` that logs to local JSONL files.

### The Problem

Subagent activity logged to `logs/session_YYYYMMDD/*.jsonl` — lost when the process ends, no cross-session querying.

### The Solution

`DialogueAgentTracker` uses DialogueDB's threading model:

- **Parent dialogue** = main session
- **Child dialogues** = subagents (linked via `threadOf`)
- **Messages** = tool calls with structured metadata

### Usage

**Create a session and register subagents:**

```typescript
import { DialogueAgentTracker } from "./lib/agent-tracker.js";

const tracker = new DialogueAgentTracker();
const session = await tracker.createSession("research-session");

// Each subagent becomes a threaded child dialogue
const researcher = await tracker.registerSubagent("researcher", "research");
```

**Run an agent with auto-tracking hooks:**

```typescript
for await (const message of query({
  prompt: researchPrompt,
  options: {
    model: "haiku",
    maxTurns: 8,
    mcpServers: { "research-tools": researchTools },
    hooks: tracker.createSubagentHooks("researcher"),
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  },
})) {
  if (message.type === "assistant") {
    const text = extractText(message.message.content);
    if (text) {
      await researcher.saveMessage({ role: "assistant", content: text });
    }
  }
}

await tracker.completeSubagent("researcher", summary);
```

**Query the tracked data:**

```typescript
// All subagent threads
const subagents = await tracker.getAllSubagents();

// A specific subagent's history
const history = await tracker.getSubagentHistory("researcher");

// Filter to tool calls
const toolCalls = history.filter((m) => m.metadata?.event === "tool_call");
for (const tc of toolCalls) {
  const data = tc.content as Record<string, unknown>;
  console.log(`${data.tool}: ${JSON.stringify(data.input)}`);
}
```

**Clean up:**

```typescript
await tracker.cleanup();  // Deletes session + all subagent threads
```

### How Threading Works

```
Session Dialogue (parent)
├── "Subagent spawned: researcher"
├── "Subagent completed: researcher"
├── "Subagent spawned: analyst"
├── "Subagent completed: analyst"
└── Final result message
    │
    ├── Researcher Thread (child, threadOf=session.id)
    │   ├── [user] prompt
    │   ├── [system] tool_call: search_web
    │   ├── [system] tool_call: search_web
    │   ├── [assistant] findings
    │   └── [system] summary
    │
    └── Analyst Thread (child, threadOf=session.id)
        ├── [user] analysis prompt
        ├── [system] tool_call: analyze_data
        └── [assistant] analysis
```

---

## Pattern 3: Audit Logging (`createAuditHook`)

**Provides:** Automatic, structured audit trail for any Agent SDK query — one line to enable.

### Usage

```typescript
import { DialogueDB } from "dialogue-db";
import { createAuditHook } from "./lib/audit-hook.js";

const db = new DialogueDB();
const auditLog = await db.createDialogue({ label: "audit-log", tags: ["audit"] });

// One line to enable
const hooks = createAuditHook(auditLog);

for await (const message of query({
  prompt: "Read config.json, update it, verify the result",
  options: {
    model: "haiku",
    maxTurns: 8,
    mcpServers: { "dev-tools": devTools },
    hooks,
  },
})) {
  // ... handle messages as normal
}
```

**Query the audit log:**

```typescript
await auditLog.loadMessages({ order: "asc" });

for (const entry of auditLog.messages) {
  const data = entry.content as Record<string, unknown>;
  console.log(`[${data.timestamp}] ${data.tool}`);
  console.log(`  input:  ${JSON.stringify(data.input)}`);
  console.log(`  output: ${data.output}`);
}

// Filter by tool name
const writeEntries = auditLog.messages.filter((m) => m.tags.includes("write_file"));
const readEntries = auditLog.messages.filter((m) => m.tags.includes("read_file"));
const errors = auditLog.messages.filter((m) => m.tags.includes("error"));
```

### Implementation

The full `createAuditHook` function (`src/lib/audit-hook.ts`):

```typescript
import type { Dialogue } from "dialogue-db";

export function createAuditHook(dialogue: Dialogue) {
  return {
    PostToolUse: [{
      hooks: [async (input: Record<string, unknown>) => {
        const timestamp = new Date().toISOString();
        await dialogue.saveMessage({
          role: "system",
          content: {
            tool: input.tool_name,
            input: input.tool_input,
            output: input.tool_response,
            timestamp,
          },
          metadata: {
            event: "audit",
            toolName: input.tool_name as string,
            timestamp,
            success: true,
          },
          tags: ["audit", input.tool_name as string],
        });
        return { continue: true };
      }],
    }],
    PostToolUseFailure: [{
      hooks: [async (input: Record<string, unknown>) => {
        const timestamp = new Date().toISOString();
        await dialogue.saveMessage({
          role: "system",
          content: {
            tool: input.tool_name,
            input: input.tool_input,
            error: input.error,
            timestamp,
          },
          metadata: {
            event: "audit",
            toolName: input.tool_name as string,
            timestamp,
            success: false,
          },
          tags: ["audit", "error", input.tool_name as string],
        });
        return { continue: true };
      }],
    }],
  };
}
```

---

## Hook Reference

These Agent SDK hooks are used across the patterns:

| Hook | When it fires | Used in |
|---|---|---|
| `PostToolUse` | After a successful tool call | `createAuditHook`, `createSubagentHooks` |
| `PostToolUseFailure` | After a failed tool call | `createAuditHook` |

### Hook input shape

Both hooks receive an input object with:

```typescript
{
  tool_name: string;       // Name of the tool that was called
  tool_input: unknown;     // Input passed to the tool
  tool_response: unknown;  // Tool result (PostToolUse only)
  error: unknown;          // Error (PostToolUseFailure only)
}
```

### Combining hooks

You can use multiple patterns together:

```typescript
const tracker = new DialogueAgentTracker();
const auditLog = await db.createDialogue({ label: "audit" });

const hooks = {
  ...tracker.createSubagentHooks("researcher"),
  ...createAuditHook(auditLog),
};
```

---

## Examples

Run the working examples:

```bash
npm run chat-persistence    # Pattern 1: Drop-in ChatStore replacement
npm run multi-agent         # Pattern 2: Threaded multi-agent tracking
npm run audit               # Pattern 3: One-line audit hook
```

See the full source in:

- `src/chat-persistence.ts` — Full chat persistence demo
- `src/multi-agent-tracking.ts` — Multi-agent session with two subagents
- `src/audit-logging.ts` — Audit trail for file operations
- `src/lib/dialogue-store.ts` — DialogueChatStore implementation
- `src/lib/agent-tracker.ts` — DialogueAgentTracker implementation
- `src/lib/audit-hook.ts` — createAuditHook implementation
