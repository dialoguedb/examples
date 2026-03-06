# Anthropic's Agent SDK Has a Persistence Problem. Here's the Fix.

Anthropic's Agent SDK is impressive. Autonomous agents with tool use, multi-agent orchestration, streaming — a serious framework for building production AI agents.

But open their example READMEs and you'll find the caveats:

> "Replace the in-memory ChatStore with a database. Currently all chats are lost on server restart."
> — [simple-chatapp README](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/simple-chatapp)

> "For Agent Sessions to be persisted across server restarts, you'll need to persist and restore the SDK's conversation transcripts."
> — simple-chatapp README

And the research-agent's `SubagentTracker`? It logs to local JSONL files in `logs/session_YYYYMMDD/`. Lost when the process ends. No cross-session querying. No API access.

These aren't bugs — they're acknowledged limitations. Anthropic built an agent framework, not a persistence layer. But if you're building anything beyond a demo, you need to fill these gaps yourself.

We built three drop-in solutions using DialogueDB.

## Problem 1: In-Memory Chat Storage

Anthropic's simple-chatapp uses a `ChatStore` — an in-memory `Map`. Create a chat, add messages, restart the server, everything's gone.

**The fix: `DialogueChatStore`**

A drop-in replacement. Same interface, backed by DialogueDB instead of a Map:

```typescript
import { DialogueChatStore } from "./lib/dialogue-store.js";

const store = new DialogueChatStore();

// Create a chat and add messages — identical interface
const chat = await store.createChat("support-conversation");
await store.addMessage(chat.id, "user", "My API key returns 401 on every request.");
await store.addMessage(chat.id, "assistant", "Let me help you troubleshoot that...");

// Simulate server restart — new store, no in-memory state
const newStore = new DialogueChatStore();

// Everything survived
const chats = await newStore.getAllChats();     // [{id, label: "support-conversation"}]
const messages = await newStore.getMessages(chat.id);  // All messages preserved
```

The `DialogueChatStore` class is ~55 lines. Here's the core of it:

```typescript
export class DialogueChatStore {
  private db = new DialogueDB();

  async createChat(label?: string): Promise<Dialogue> {
    return this.db.createDialogue({ label });
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

  async getAllChats() {
    const { items } = await this.db.listDialogues();
    return items;
  }

  async deleteChat(id: string): Promise<void> {
    return this.db.deleteDialogue(id);
  }
}
```

After a restart, you load the conversation history and inject it into a new agent as context. The agent picks up exactly where it left off.

## Problem 2: Local-Only Subagent Tracking

Anthropic's research-agent has a `SubagentTracker` that logs subagent activity to JSONL files on disk. When the process ends, you've got flat files. Want to query "what did the researcher agent do?" from a different service? Parse JSONL manually.

**The fix: `DialogueAgentTracker`**

Uses DialogueDB's threading model: parent dialogue = session, child dialogues = subagents. Tool calls are persisted as messages with structured metadata. Queryable from anywhere, anytime.

```typescript
import { DialogueAgentTracker } from "./lib/agent-tracker.js";

const tracker = new DialogueAgentTracker();
const session = await tracker.createSession("research-session");

// Register subagents — each becomes a threaded child dialogue
const researcher = await tracker.registerSubagent("researcher", "research");
const analyst = await tracker.registerSubagent("analyst", "analysis");
```

The real power is in the hooks. When you pass `tracker.createSubagentHooks("researcher")` to the Agent SDK's `query()` call, every tool call is automatically persisted:

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
  // ... handle messages
}

await tracker.completeSubagent("researcher", researchFindings);
```

After the run, query the tracked data:

```typescript
// Get all subagent threads
const subagents = await tracker.getAllSubagents();
// => [{ label: "researcher", id: "..." }, { label: "analyst", id: "..." }]

// Get a specific subagent's tool call history
const history = await tracker.getSubagentHistory("researcher");
const toolCalls = history.filter((m) => m.metadata?.event === "tool_call");
// => [{ content: { tool: "search_web", input: {...}, output: "..." }, ... }]
```

Side-by-side comparison:

| | SubagentTracker (JSONL) | DialogueAgentTracker (DialogueDB) |
|---|---|---|
| Storage | `logs/session_YYYYMMDD/*.jsonl` | Managed database |
| After process ends | Files on disk, no API access | Queryable from any service |
| Cross-session query | Manual file parsing | API calls with filters |
| Multi-agent structure | Flat files | Threaded parent/child dialogues |

## Problem 3: No Audit Trail

When an Agent SDK agent calls tools, there's no built-in audit log. If the agent reads files, writes files, and runs commands, you have no structured record of what happened, when, with what inputs, and whether it succeeded.

**The fix: `createAuditHook`**

A single function that returns Agent SDK hooks. Attach it to any `query()` call and every tool call gets persisted:

```typescript
import { createAuditHook } from "./lib/audit-hook.js";

const db = new DialogueDB();
const auditLog = await db.createDialogue({ label: "audit-log", tags: ["audit"] });

// One line
const hooks = createAuditHook(auditLog);

for await (const message of query({
  prompt: "Read config.json, update it, verify the result",
  options: {
    model: "haiku",
    maxTurns: 8,
    mcpServers: { "dev-tools": devTools },
    hooks,  // That's it
  },
})) {
  // ... handle messages
}
```

After the run, the audit log is a dialogue full of structured entries:

```typescript
await auditLog.loadMessages({ order: "asc" });

for (const entry of auditLog.messages) {
  const data = entry.content as Record<string, unknown>;
  console.log(`[${data.timestamp}] ${data.tool}`);
  console.log(`  input:  ${JSON.stringify(data.input)}`);
  console.log(`  output: ${data.output}`);
}

// Filter by tool name using tags
const writeEntries = auditLog.messages.filter((m) => m.tags.includes("write_file"));
```

The hook implementation is ~50 lines. It handles both `PostToolUse` (successful calls) and `PostToolUseFailure` (failed calls), with different tags for easy filtering:

```typescript
export function createAuditHook(dialogue: Dialogue) {
  return {
    PostToolUse: [{
      hooks: [async (input: Record<string, unknown>) => {
        await dialogue.saveMessage({
          role: "system",
          content: {
            tool: input.tool_name,
            input: input.tool_input,
            output: input.tool_response,
            timestamp: new Date().toISOString(),
          },
          metadata: { event: "audit", toolName: input.tool_name, success: true },
          tags: ["audit", input.tool_name as string],
        });
        return { continue: true };
      }],
    }],
    PostToolUseFailure: [{
      hooks: [async (input: Record<string, unknown>) => {
        await dialogue.saveMessage({
          role: "system",
          content: {
            tool: input.tool_name,
            input: input.tool_input,
            error: input.error,
            timestamp: new Date().toISOString(),
          },
          metadata: { event: "audit", toolName: input.tool_name, success: false },
          tags: ["audit", "error", input.tool_name as string],
        });
        return { continue: true };
      }],
    }],
  };
}
```

## These Aren't Toy Demos

Each of these solves a gap that Anthropic themselves acknowledge in their own READMEs. The implementations are small — 55 lines, 130 lines, 50 lines — because DialogueDB handles the hard parts: storage, querying, threading, metadata, multi-tenancy.

If you're building with the Agent SDK and you need:
- Conversations that survive restarts
- Multi-agent sessions you can query from other services
- An audit trail of what your agents did

These are the patterns.

```bash
git clone https://github.com/dialogue-db/examples
cd examples/anthropic-agent-sdk
npm install
cp .env.example .env
# Add your keys

npm run chat-persistence    # Drop-in ChatStore replacement
npm run multi-agent         # Threaded multi-agent tracking
npm run audit               # One-line audit hook
```

[Get started at dialoguedb.com](https://dialoguedb.com)
