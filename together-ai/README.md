# DialogueDB + Together AI SDK Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using [Together AI](https://together.ai) and open-source models like Llama 3.

> **Why Together AI?** Together AI gives you access to leading open-source models (Llama, Mistral, Qwen) with an OpenAI-compatible API. Pair it with DialogueDB to persist conversations across restarts — no vendor lock-in on either the model or the storage layer.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You'll need:
- A [DialogueDB](https://dialoguedb.com) API key and endpoint
- A [Together AI](https://api.together.xyz) API key

## Hello World

The simplest proof of concept. Creates a conversation, chats with Llama via Together AI, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Llama retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to Llama 3.1, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — the model remembers everything from before the restart

## Advanced

Full tool-calling agent loop with cold resume.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `convert_temperature`, `save_note` with manual tool execution loop
- **Invocation 1**: Multi-tool agent loop — Llama calls tools, every message (including `tool_calls` and `tool` role messages) is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, reconstructs the exact message sequence including tool call history, sends a follow-up with full prior context
- Token usage tracking in message metadata

### Running as separate processes

```bash
# Terminal 1
npm run advanced:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run advanced:2
```

## Why Together AI + DialogueDB?

Together AI's chat API is stateless — every request needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **Model flexibility** — switch between Llama, Mistral, Qwen without losing conversation history
- **Tool call storage** — assistant `tool_calls` and `tool` results persisted exactly as the API expects them
- **Metadata** — track token usage, costs, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, content
