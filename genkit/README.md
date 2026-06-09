# DialogueDB + Genkit

Persistent conversation memory for [Genkit](https://genkit.dev/) applications, powered by [DialogueDB](https://dialoguedb.com).

Genkit is Google's framework for building production AI applications — type-safe flows, automatic tool execution, structured output, and built-in observability. But it doesn't provide conversation persistence. DialogueDB fills that gap: every message survives cold restarts, deploys, and serverless cold starts.

## What you get

- **Conversation persistence** — save and load full chat history through DialogueDB
- **Cross-process resume** — shut down, restart, continue where you left off
- **Automatic tool execution** — Genkit handles the tool call loop; DialogueDB stores the results
- **Type-safe flows** — Genkit flows with Zod schemas + DialogueDB persistence = a production chat backend

## Setup

1. Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

You need:
- `DIALOGUEDB_API_KEY` — from [dialoguedb.com](https://dialoguedb.com)
- `DIALOGUEDB_ENDPOINT` — your DialogueDB endpoint
- `GOOGLE_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)

2. Install dependencies:

```bash
npm install
```

## Examples

### hello-world.ts — Basic persistence

The simplest integration. Creates a conversation, chats with Gemini, simulates a cold restart, and continues with full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Creating a DialogueDB conversation
- Saving user and model messages after each exchange
- Loading the full conversation from scratch (simulating a new process)
- Gemini retaining all prior context after the restart

### flow.ts — Genkit flow with tools

A production-style chat flow using `ai.defineFlow()` with tool calling. The flow manages its own DialogueDB persistence — call it from an HTTP handler, a CLI, or a Cloud Function.

```bash
npm run flow
```

**What it demonstrates:**
- `ai.defineTool()` for function calling (weather lookup, note saving)
- `ai.defineFlow()` with typed input/output schemas
- DialogueDB as the persistence layer inside a reusable flow
- Automatic tool execution — Genkit calls tools and re-prompts until done
- Cold restart recovery using the same dialogue ID
