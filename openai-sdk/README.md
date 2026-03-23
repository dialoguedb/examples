# DialogueDB + OpenAI SDK (Chat Completions API) Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [OpenAI SDK](https://platform.openai.com/docs/api-reference) Chat Completions API directly.

> **Also see:** [`../anthropic-sdk/`](../anthropic-sdk/) for the same integration patterns using the Anthropic SDK.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest proof of concept. Creates a conversation, chats with GPT via the Chat Completions API, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — GPT retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to GPT, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — GPT remembers everything from before the restart

## Advanced

Full manual tool loop with cold resume.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `calculate`, `save_note` with manual tool execution loop
- **Invocation 1**: Multi-tool agent loop — you implement the loop, GPT calls tools, every message (including `tool_calls` and `tool` role messages) is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, reconstructs the exact message sequence including tool call history, sends a follow-up with full prior context
- Token usage tracking in message metadata

### Running as separate processes

```bash
# Terminal 1
npm run advanced:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run advanced:2
```

## Why OpenAI + DialogueDB?

OpenAI's Chat Completions API is stateless — every request needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read/query conversations
- **Tool call storage** — assistant `tool_calls` and `tool` results persisted exactly as OpenAI expects them
- **Metadata** — track token usage, costs, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, content
