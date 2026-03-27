# DialogueDB + Groq SDK Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Groq SDK](https://console.groq.com/docs/libraries) for ultra-fast LLM inference.

Groq delivers sub-second inference on open models like Llama 3.3. Pair it with DialogueDB and your conversations survive restarts, deploys, and cold starts — without sacrificing Groq's speed.

> **Also see:** [`../openai-sdk/`](../openai-sdk/) for the same patterns using the OpenAI SDK.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

Get your keys:
- **GROQ_API_KEY** — [console.groq.com/keys](https://console.groq.com/keys)
- **DIALOGUEDB_API_KEY** / **DIALOGUEDB_ENDPOINT** — [dialoguedb.com](https://dialoguedb.com)

## Hello World

The simplest proof of concept. Creates a conversation, chats with Llama via Groq, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Llama retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to Llama via Groq, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Llama remembers everything from before the restart

## Advanced

Full manual tool loop with cold resume.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `get_game_score`, `save_note` with manual tool execution loop
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

## Why Groq + DialogueDB?

Groq's API is stateless — every request needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read/query conversations
- **Tool call storage** — assistant `tool_calls` and `tool` results persisted exactly as Groq expects them
- **Metadata** — track token usage, costs, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, content

Combined with Groq's speed, you get persistent conversations with sub-second response times.
