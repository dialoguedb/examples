# DialogueDB + Google Gemini Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Google GenAI SDK](https://www.npmjs.com/package/@google/genai) (`@google/genai`) directly.

> **Also see:** [`../openai-sdk/`](../openai-sdk/) and [`../anthropic-sdk/`](../anthropic-sdk/) for the same patterns with other providers.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You'll need:
- `DIALOGUEDB_API_KEY` and `DIALOGUEDB_ENDPOINT` — from [dialoguedb.com](https://dialoguedb.com)
- `GOOGLE_API_KEY` — from [aistudio.google.com](https://aistudio.google.com/app/apikey)

## Hello World

The simplest proof of concept. Creates a dialogue, chats with Gemini, simulates a cold restart by loading the dialogue fresh from DialogueDB, then continues chatting — Gemini retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB dialogue
- Send messages to Gemini via `ai.models.generateContent`, persist every exchange
- Load the dialogue from scratch (simulating a new process)
- Continue the conversation — Gemini remembers everything from before the restart

### Role mapping

DialogueDB stores messages with `"user"` and `"assistant"` roles (portable across providers). Gemini's own convention uses `"user"` and `"model"`. The example maps between them on the fly so your stored dialogues are provider-agnostic.

## Tools (Function Calling)

A full manual tool loop with cold resume. Gemini calls `get_weather` and `calculate` across two separate process invocations.

```bash
npm run tools              # Run both invocations back-to-back
npm run tools -- --invocation=1   # Only invocation 1 (prints dialogue ID)
DIALOGUE_ID=<id> npm run tools -- --invocation=2   # Only invocation 2
```

**What it demonstrates:**
- Two tools: `get_weather` and `calculate` with a safe arithmetic evaluator (no `eval`)
- **Invocation 1**: Multi-step agent loop — Gemini calls tools, every message (including `functionCall` and `functionResponse` parts) is persisted to DialogueDB as structured content
- **Invocation 2**: Cold resume — loads the full dialogue from DialogueDB, reconstructs the exact `Content[]` sequence (including tool-call history) and sends a follow-up that references earlier results
- Token usage tracked in message metadata

### How tool calls round-trip

Gemini messages are made of `parts` — text, `functionCall`, or `functionResponse`. DialogueDB's `content` field accepts `string | object | array`, so the example stores each message's `parts` array directly. On resume, loading messages reconstructs the exact Gemini `Content[]` with no lossy conversion.

## Why Gemini + DialogueDB?

The Gemini API is stateless — every `generateContent` call needs the full `contents` array. DialogueDB gives you:

- **Cross-process persistence** — dialogues survive restarts, deploys, serverless cold starts
- **API access** — any service can read/query dialogues
- **Structured tool-call storage** — `functionCall` and `functionResponse` parts persist exactly as Gemini expects them
- **Metadata** — track token usage, costs, and custom data alongside messages
- **Searchability** — find dialogues by label, tags, date, content

## Verify it compiles

```bash
npx tsc --noEmit
```
