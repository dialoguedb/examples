# Social Media Content — DialogueDB + Claude Agent SDK

## Twitter/X

### Thread: Quoting Anthropic's Own READMEs

**Tweet 1 (hook):**
Anthropic's Agent SDK examples ship with this disclaimer:

"Replace the in-memory ChatStore with a database. Currently all chats are lost on server restart."

We did. It's 55 lines.

🧵 Three persistence problems in the Agent SDK, and three drop-in fixes.

**Tweet 2:**
Problem 1: In-memory chat storage

Their simple-chatapp uses a Map. Restart the server, lose everything.

Fix: DialogueChatStore — same interface (createChat, addMessage, getMessages), backed by DialogueDB instead of RAM.

```
// Before
const chats = new Map();
// restart → empty Map

// After
const store = new DialogueChatStore();
// restart → all chats preserved
```

**Tweet 3:**
Problem 2: Local-only subagent tracking

Their research-agent logs to JSONL files in logs/session_YYYYMMDD/. Process ends, data is stranded on disk.

Fix: DialogueAgentTracker — parent dialogue for the session, threaded child dialogues for each subagent. Tool calls tracked via PostToolUse hooks.

Queryable from any service, any time.

**Tweet 4:**
Problem 3: No audit trail

Agent calls read_file, write_file, run_command. Where's the record?

Fix: createAuditHook — one function, one line to enable:

```
const hooks = createAuditHook(auditLog);
query({ prompt, options: { hooks } });
```

Every tool call persisted with structured metadata. Filter by tool name, timestamp, success/failure.

**Tweet 5:**
These aren't wrappers or abstractions. They're direct replacements for the gaps Anthropic themselves acknowledge in their own READMEs.

55 lines. 130 lines. 50 lines.

Examples: [link]
dialoguedb.com

---

### Single Tweet: Before/After

```
// Anthropic Agent SDK — their ChatStore
const chats = new Map();
// Server restart → 0 chats

// DialogueChatStore (drop-in replacement)
const store = new DialogueChatStore();
// Server restart → all chats intact
```

55 lines to replace in-memory with managed persistence.

dialoguedb.com

---

### Single Tweet: Multi-Agent

Running multi-agent workflows with the Claude Agent SDK?

Each subagent gets its own threaded dialogue in DialogueDB.

After the run: "What tools did the researcher use?" "How long did the analyst take?" "Show me everything from Tuesday."

All queryable via API. No JSONL parsing.

---

### Single Tweet: Audit Hook

One line to add an audit trail to any Agent SDK query:

```
const hooks = createAuditHook(auditLog);
```

Every tool call — input, output, timestamp, success/failure — persisted to DialogueDB. Searchable by tool name, filterable by tags.

50 lines of code. Works with any agent.

---

## LinkedIn

### Post: Multi-Agent Observability for the Claude Agent SDK

We've been working with Anthropic's Claude Agent SDK to build multi-agent systems. The SDK is excellent for orchestration — tool use, subagent delegation, streaming responses.

But observability is left as an exercise for the reader.

Anthropic's own research-agent example logs subagent activity to local JSONL files. When the process ends, you have flat files on disk. No API access, no cross-session querying, no way for another service to ask "what did this agent do?"

We built DialogueAgentTracker — a drop-in replacement that uses DialogueDB's threading model:

**Parent dialogue = session.** Each run gets its own dialogue.

**Child dialogues = subagents.** Each subagent's activity is a threaded dialogue linked to the session via `threadOf`.

**PostToolUse hooks = automatic tracking.** Every tool call is persisted with structured metadata (tool name, input, output, timestamp).

The result: after a multi-agent run, you can query from any service:
- "Show me all subagent threads for session X"
- "What tools did the researcher call?"
- "Filter to failed tool calls"

This matters when you're running agents in production. You need to know what happened, when, and why — not just during the run, but hours or days later from a dashboard, monitoring service, or audit system.

The implementation is ~130 lines and plugs directly into the Agent SDK's hooks system. We also built a one-line audit hook (createAuditHook) that adds a complete tool call audit trail to any query() call.

Both are open source with working examples.

[link to examples]

---

## Dev Community (Hacker News / Reddit)

### Post: Drop-in persistence for Anthropic's Agent SDK — three patterns, all open source

**Title:** Drop-in persistence for the Claude Agent SDK – 3 open-source patterns using DialogueDB

**Body:**

We've been building production multi-agent systems with Anthropic's Claude Agent SDK and ran into three gaps that their own READMEs acknowledge:

**1. Chat storage is in-memory.** The simple-chatapp example uses a `Map`. Their README literally says "Replace the in-memory ChatStore with a database. Currently all chats are lost on server restart." We wrote `DialogueChatStore` — a drop-in replacement (~55 lines) backed by DialogueDB instead of RAM. Same interface: `createChat`, `addMessage`, `getMessages`, `deleteChat`.

**2. Subagent tracking is local JSONL.** The research-agent's `SubagentTracker` writes to `logs/session_YYYYMMDD/`. When the process dies, you've got flat files. No API access, no cross-session querying. We wrote `DialogueAgentTracker` (~130 lines) that uses DialogueDB's threaded dialogues: parent dialogue for the session, child dialogues for each subagent. Tool calls are persisted via `PostToolUse` hooks with structured metadata. Query from any service, any time.

**3. No audit trail.** When an agent calls `read_file`, `write_file`, `run_command` — there's no structured record. We wrote `createAuditHook` (~50 lines) — a function that returns Agent SDK hooks config. Spread it into your `query()` options and every tool call is automatically logged with input, output, timestamp, and success/failure status. Filter by tool name using tags.

All three patterns use DialogueDB — a managed database purpose-built for AI conversations. The key feature for agents: threading (model multi-agent sessions as parent/child dialogues), structured metadata on messages, and tags for filtering.

Working examples with full source: [link]

The implementations are intentionally small because the persistence layer (DialogueDB) handles the hard parts. If you're using the Agent SDK and need conversations to survive restarts, subagent activity you can actually query, or a tool call audit trail — these are the patterns we've been using in production.

Feedback welcome, especially from folks who've built their own Agent SDK persistence layers.
