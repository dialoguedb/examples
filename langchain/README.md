# DialogueDB + LangChain Examples

Persistent conversation memory for [LangChain](https://js.langchain.com/) chains and agents, powered by [DialogueDB](https://dialoguedb.com).

LangChain's built-in memory classes (`BufferMemory`, `ConversationSummaryMemory`, etc.) default to in-memory storage — conversations are lost on restart. `DialogueChatHistory` is a drop-in replacement that persists every message to DialogueDB, so your chains and agents survive cold restarts, deploys, and serverless cold starts.

> **Also see:** [`../anthropic-sdk/`](../anthropic-sdk/) for the same pattern using the Anthropic SDK directly.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest integration. Creates a conversation chain with DialogueDB-backed memory, chats with Claude, simulates a cold restart, and continues chatting with full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- `DialogueChatHistory` as a drop-in `chatHistory` for LangChain's `BufferMemory`
- Wiring memory into a `ConversationChain`
- Cold restart: new chain instance, same dialogue ID — Claude remembers everything

## Agent with Tools

A tool-calling agent with persistent memory across process boundaries.

```bash
npm run agent          # Run both invocations back-to-back
npm run agent:1        # Run only invocation 1 (prints dialogue ID)
npm run agent:2        # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- LangChain `createToolCallingAgent` with `get_weather` and `calculator` tools
- Full conversation history (including tool interactions) persisted to DialogueDB
- **Invocation 1**: Multi-tool query, follow-up questions — all persisted
- **Invocation 2**: Cold resume from a new process with full context

### Running as separate processes

```bash
# Terminal 1
npm run agent:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run agent:2
```

## Key File: `DialogueChatHistory`

[`src/lib/dialogue-history.ts`](src/lib/dialogue-history.ts) — the drop-in replacement (~90 lines)

Implements LangChain's `BaseListChatMessageHistory` interface:
- `getMessages()` — loads from DialogueDB, converts to LangChain message types
- `addMessage()` — persists to DialogueDB
- `clear()` — deletes the dialogue

Works with any LangChain memory class that accepts a `chatHistory`:

```typescript
import { DialogueChatHistory } from "./lib/dialogue-history.js";
import { BufferMemory } from "langchain/memory";

const history = new DialogueChatHistory({ label: "my-session" });
const memory = new BufferMemory({ chatHistory: history, returnMessages: true });

// Use with any chain or agent
```

## Project Structure

```
src/
  lib/
    dialogue-history.ts    # Drop-in BaseListChatMessageHistory implementation
  hello-world.ts           # Simple conversation chain example
  agent-with-tools.ts      # Tool-calling agent with cold resume
```

## Why DialogueDB for LangChain?

LangChain has memory classes, but they store messages in-process. DialogueDB adds:

- **Persistence** — conversations survive restarts, deploys, Lambda cold starts
- **Cross-process** — any service can load a conversation by its ID
- **API access** — query, search, and manage conversations via REST
- **Metadata** — attach token usage, costs, or custom data to any message
- **Threading** — model multi-agent sessions as parent/child dialogues
