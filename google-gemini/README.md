# DialogueDB + Google Gemini SDK Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Google Gemini SDK](https://ai.google.dev/gemini-api/docs).

> **Also see:** [`../openai-sdk/`](../openai-sdk/) and [`../anthropic-sdk/`](../anthropic-sdk/) for the same patterns with other providers.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest proof of concept. Creates a conversation, chats with Gemini, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Gemini retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to Gemini, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Gemini remembers everything from before the restart

## Advanced

Full function calling loop with cold resume.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `calculate`, `save_note` with Gemini's native function calling
- **Invocation 1**: Multi-tool agent loop — Gemini calls functions, you execute them, every turn (including `functionCall` and `functionResponse` parts) is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, reconstructs the exact message sequence including function call history, sends a follow-up with full prior context
- Token usage tracking in message metadata

### Running as separate processes

```bash
# Terminal 1
npm run advanced:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run advanced:2
```

## Gemini-specific notes

Gemini's message format differs from OpenAI/Anthropic:
- Roles are `"user"` and `"model"` (not `"assistant"`)
- Messages use `parts` arrays: `[{ text: "..." }]`, `[{ functionCall: {...} }]`, or `[{ functionResponse: {...} }]`
- Function results are sent as `user` turns containing `functionResponse` parts

DialogueDB's `content` field accepts objects directly, so Gemini's `Content` objects are stored as-is — no serialization needed.

## Why Gemini + DialogueDB?

Gemini's API is stateless — every request needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read/query conversations
- **Function call storage** — `functionCall` and `functionResponse` parts persisted in Gemini's native format
- **Metadata** — track token usage, costs, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, content
