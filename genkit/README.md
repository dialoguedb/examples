# DialogueDB + Genkit

[Genkit](https://github.com/firebase/genkit) is Google's open-source framework for building AI applications in TypeScript. It provides a unified API for model providers, automatic tool execution, structured output via Zod, and a dev UI for testing flows locally.

Genkit has its own session persistence (`FileSessionStore`), but it writes to local disk — conversations are lost on deploy, across serverless invocations, or between services. These examples swap in DialogueDB as the conversation store so history survives cold starts, scales across processes, and is queryable via API.

> **Also see:** [`../google-genai/`](../google-genai/) for the same patterns using the raw `@google/genai` SDK without Genkit.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- A [DialogueDB](https://dialoguedb.com) API key (`DIALOGUE_DB_API_KEY`)
- A [Google AI](https://aistudio.google.com/apikey) API key (`GOOGLE_API_KEY`)

## Hello World

Chats with Gemini via Genkit, simulates a cold restart, and continues with full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Storing every turn in DialogueDB and rebuilding Genkit history on each call
- `assistant` mapped to Genkit's `model` role and back
- System messages stored like any other, passed to Genkit via the `system` parameter
- Cold restart: a new DialogueDB client, same dialogue ID, full context

## Tool Calling

Genkit resolves tool calls automatically — it calls the model, executes any requested tools, and loops until the model produces a final text response. This example persists the full conversation including tool interactions.

```bash
npm run tool-calling
```

**What it demonstrates:**
- Genkit `defineTool` with Zod schemas for input/output validation
- Automatic tool execution loop (no manual tool call handling)
- Tool request/response parts stored in DialogueDB as structured content
- Cold restart with tool call history intact

## Key File: `persist.ts`

[`src/persist.ts`](src/persist.ts) holds the bridge between DialogueDB and Genkit:

- `toGenkitHistory(dialogue)` — stored messages to Genkit `MessageData[]`
- `getSystemPrompt(dialogue)` — stored `system` messages, joined
- `loadDialogue(db, id, namespace)` — get-or-create, then load oldest first

Two details are worth knowing:

**Role mapping.** DialogueDB uses `assistant` for model responses; Genkit uses `model`. The bridge translates both directions so messages round-trip correctly.

**Cross-SDK content.** A dialogue may contain messages written by a different SDK (Anthropic content blocks, OpenAI tool calls). Parts that already look like Genkit Parts are forwarded as-is; anything else is serialized to a text part so the information still reaches the model instead of the request failing.

## Project Structure

```
src/
  env.ts            # Environment variable helper
  persist.ts        # MessageData conversion and dialogue loading
  hello-world.ts    # Chat, cold restart, resume
  tool-calling.ts   # Automatic tool execution with persistence
```

## Why DialogueDB for Genkit?

Genkit's built-in `FileSessionStore` writes session snapshots to local files. That works for development, but in production you need conversations that:

- **Survive deploys and cold starts** — serverless functions and containers restart constantly
- **Are accessible across services** — any process can read or continue a conversation via API
- **Support search and metadata** — find conversations by label, tags, or content
- **Store structured content** — tool calls, media references, and custom metadata alongside text
