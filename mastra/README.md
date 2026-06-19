# DialogueDB + Mastra

Use [DialogueDB](https://dialoguedb.com) as a portable conversation store for [Mastra](https://mastra.ai) agents — the TypeScript AI agent framework with 22k+ GitHub stars.

## Why DialogueDB with Mastra?

Mastra has built-in memory tied to its own storage layer. DialogueDB gives you:

- **Cross-service access** — your Mastra agent, your API, your dashboard all read the same conversations
- **REST API** — query conversations from any language, not just TypeScript
- **Infrastructure independence** — conversations survive framework migrations
- **Cold restart resilience** — reload full agent context from DialogueDB after deploys or crashes

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Examples

### Agent with Tools

Creates a Mastra agent with weather lookup and note-saving tools. Every message is persisted to DialogueDB. Demonstrates cold restart — the agent resumes with full context.

```bash
npm run start
```

### Streaming

Streams agent responses token-by-token to stdout while persisting the complete response to DialogueDB after streaming finishes.

```bash
npm run streaming
```

## How it works

```
User message → Save to DialogueDB → Load full history → Agent generates → Save response → Repeat
```

1. Each user message is saved to DialogueDB before sending to the agent
2. The full message history is loaded from DialogueDB and passed to `agent.generate()`
3. The agent's response (including tool call metadata) is saved back to DialogueDB
4. On cold restart, `db.getDialogue(id)` + `loadMessages()` restores the full conversation

This pattern keeps DialogueDB as the single source of truth for conversation state, making it accessible to any service that needs it.
