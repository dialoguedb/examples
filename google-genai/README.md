# DialogueDB + Google GenAI SDK (Gemini) Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Google GenAI SDK](https://github.com/googleapis/js-genai) for Gemini.

> **Also see:** [`../openai-sdk/`](../openai-sdk/) and [`../anthropic-sdk/`](../anthropic-sdk/) for the same integration patterns with other providers.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

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

Full manual function-calling loop with cold resume.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `calculate`, `save_note` with manual function execution loop
- **Invocation 1**: Multi-tool agent loop — Gemini calls functions, every message (including `functionCall` and `functionResponse` parts) is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, reconstructs the exact Content sequence including function call history, sends a follow-up with full prior context
- Token usage tracking in message metadata

### Running as separate processes

```bash
# Terminal 1
npm run advanced:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run advanced:2
```

## Why Gemini + DialogueDB?

Gemini's `generateContent` API is stateless — every request needs the full `Content[]` history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read/query conversations
- **Function call storage** — `functionCall` and `functionResponse` parts persisted exactly as Gemini expects them
- **Metadata** — track token usage, costs, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, content
