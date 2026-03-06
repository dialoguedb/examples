# DialogueDB + Claude Agent SDK Examples

Anthropic's Agent SDK demos have a persistence problem. Here's how DialogueDB solves it.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Example 1: Chat Persistence

**Solves:** The [Simple Chat App](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/simple-chatapp)'s in-memory storage limitation.

> "Replace the in-memory ChatStore with a database. Currently all chats are lost on server restart."
> — Anthropic's simple-chatapp README

`DialogueChatStore` is a drop-in replacement for their `ChatStore`. Same interface (`createChat`, `getChat`, `getAllChats`, `addMessage`, `getMessages`, `deleteChat`), backed by DialogueDB instead of an in-memory Map.

```bash
npm run chat-persistence
```

**What it does:**
- Creates a support conversation, persists each exchange
- Simulates a server restart — new store instance, zero in-memory state
- Lists chats (still there), loads messages (all preserved)
- Continues the conversation with full context injected into a new agent

**Key file:** [`src/lib/dialogue-store.ts`](src/lib/dialogue-store.ts) — the drop-in replacement (~55 lines)

## Example 2: Multi-Agent Tracking

**Solves:** The [Research Agent](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/research-agent)'s local JSONL logging problem.

> The research-agent's `SubagentTracker` logs to `logs/session_YYYYMMDD/*.jsonl`. Lost when the process ends. No cross-session querying.

`DialogueAgentTracker` replaces JSONL files with DialogueDB's threaded dialogues:

```bash
npm run multi-agent
```

**What it does:**
- Creates a parent session dialogue
- Runs a "researcher" subagent — tracked as a threaded child dialogue
- Runs an "analyst" subagent — another threaded child dialogue
- PostToolUse hooks auto-persist every tool call with metadata
- After the run: queries by agent ("what did the researcher do?"), by tool, by time

**Key file:** [`src/lib/agent-tracker.ts`](src/lib/agent-tracker.ts) — the drop-in replacement (~130 lines)

## Example 3: Audit Logging

The simplest, most reusable pattern — a hook you can drop into any Agent SDK query.

```bash
npm run audit
```

**What it does:**
- Creates a dialogue for the audit log
- Calls `createAuditHook(dialogue)` — returns a hooks config object
- Spreads the hooks into `query({ options: { hooks } })`
- Every tool call is automatically persisted with structured metadata
- After the run: queries the audit log by tool name, timestamp, success/failure

**Key file:** [`src/lib/audit-hook.ts`](src/lib/audit-hook.ts) — the reusable hook (~50 lines)

## Project Structure

```
src/
  lib/
    dialogue-store.ts       # Drop-in ChatStore replacement
    agent-tracker.ts        # Drop-in SubagentTracker replacement
    audit-hook.ts           # Reusable PostToolUse audit hook
  chat-persistence.ts       # Example 1
  multi-agent-tracking.ts   # Example 2
  audit-logging.ts          # Example 3
```

## Why DialogueDB?

The Agent SDK has built-in session management, but it's local to the process. DialogueDB adds:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read/query agent conversations
- **Threading** — model multi-agent sessions as parent/child dialogues
- **Searchability** — find conversations by label, tags, date, content
- **Structured metadata** — track tool calls, costs, agent activity alongside messages
- **Multi-tenancy** — namespace isolation for different users/projects
