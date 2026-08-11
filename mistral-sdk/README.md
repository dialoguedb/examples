# DialogueDB + Mistral SDK Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Mistral AI SDK](https://docs.mistral.ai/).

> **Also see:** [`../openai-sdk/`](../openai-sdk/) and [`../anthropic-sdk/`](../anthropic-sdk/) for the same integration patterns using OpenAI and Anthropic SDKs.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest proof of concept. Creates a conversation, chats with Mistral, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Mistral retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to Mistral, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Mistral remembers everything from before the restart

## Tool Use

Full manual tool loop with cold resume.

```bash
npm run tool-use          # Run both invocations back-to-back
npm run tool-use:1        # Run only invocation 1 (prints dialogue ID)
npm run tool-use:2        # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `convert_temperature`, `save_note` with manual tool execution loop
- **Invocation 1**: Multi-tool agent loop — Mistral calls tools, every message (including `toolCalls` and `tool` role messages) is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, reconstructs the exact message sequence including tool call history, sends a follow-up with full prior context
- Token usage tracking in message metadata

### Running as separate processes

```bash
# Terminal 1
npm run tool-use:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run tool-use:2
```

## Why Mistral + DialogueDB?

Mistral's Chat API is stateless — every request needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read/query conversations
- **Tool call storage** — assistant `toolCalls` and `tool` results persisted exactly as Mistral expects them
- **Metadata** — track token usage, costs, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, content
