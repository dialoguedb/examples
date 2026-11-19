# DialogueDB + Mastra

Two examples showing how [DialogueDB](https://dialoguedb.com) persists [Mastra](https://mastra.ai) agent conversations across sessions and cold restarts.

Mastra is a TypeScript-first AI agent framework with built-in tool execution, model routing, and workflows. DialogueDB adds durable conversation persistence — every agent exchange is saved and can be loaded in a new process or deployment.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need a [DialogueDB API key](https://dialoguedb.com) and an [OpenAI API key](https://platform.openai.com).

## Hello World

A Mastra agent with weather and temperature tools. It chats, persists each exchange to DialogueDB, then simulates a cold restart and picks up with full context.

```bash
npm run hello-world
```

**What it demonstrates:**

- Define Mastra tools with `createTool` and Zod schemas
- Create an agent with `model: "openai/gpt-4o-mini"` (Mastra's magic string routing)
- Persist every user/assistant exchange to DialogueDB
- Load the conversation from scratch and continue — the agent remembers everything

## Persistent Agent

Full cold resume across separate process invocations. The agent plans a multi-city trip in invocation 1, then a new process loads the conversation and continues planning.

```bash
npm run persistent-agent              # Both invocations back-to-back
npm run persistent-agent -- --inv=1   # Invocation 1 only (prints dialogue ID)
npm run persistent-agent -- --inv=2   # Invocation 2 (needs DIALOGUE_ID env)
```

### Running as separate processes

```bash
# Terminal 1
npm run persistent-agent -- --inv=1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run persistent-agent -- --inv=2
```

## Why Mastra + DialogueDB?

Mastra agents are stateless by default — each `generate()` call needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read or query agent conversations
- **Metadata** — track finish reasons, step counts, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, or content
