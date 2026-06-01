# DialogueDB + llm-exe: Persistent Chatbot

Build chatbots with [llm-exe](https://llm-exe.com)'s typed executor pipeline and [DialogueDB](https://dialoguedb.com) for conversation persistence. llm-exe handles prompt templating, LLM calls, and structured response parsing — but its state is in-memory. DialogueDB persists every message so conversations survive process restarts, deploys, and cold starts.

## What it does

A travel planning chatbot where each message runs through an llm-exe executor pipeline:

```
prompt template (with DialogueDB history) → LLM → JSON parser → structured output
```

The JSON parser extracts **both** the conversational response **and** structured metadata (intent, sentiment) in a single LLM call. DialogueDB stores the response as message content and the metadata alongside it — so on cold restart you get full conversation context plus structured analytics from every past interaction.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- `DIALOGUEDB_API_KEY` — from [dialoguedb.com](https://dialoguedb.com)
- `DIALOGUEDB_ENDPOINT` — your DialogueDB endpoint
- `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com)

## Run

```bash
npm run chatbot          # Both invocations back-to-back
npm run chatbot:1        # Invocation 1 only (prints dialogue ID)
npm run chatbot:2        # Invocation 2 only (needs DIALOGUE_ID env)
```

### Running as separate processes

```bash
# Terminal 1
npm run chatbot:1

# Terminal 2 (paste the dialogue ID from above)
DIALOGUE_ID=<id> npm run chatbot:2
```

## How it works

**Invocation 1** builds a multi-turn travel planning conversation. Each turn:
1. Loads conversation history from DialogueDB
2. Builds an llm-exe `createChatPrompt` with that history
3. Runs an executor with a `defineSchema`-typed JSON parser
4. Saves the response + extracted intent/sentiment to DialogueDB

**Invocation 2** simulates a cold restart. It loads the full conversation from DialogueDB, asks a recap question, and the bot demonstrates it has full context from the previous session.

## Why llm-exe + DialogueDB?

llm-exe gives you composable, typed building blocks for LLM interactions — prompt templates with Handlebars, structured parsers, executor pipelines — but its state management (`createState`, `createDialogue`) is in-memory only. DialogueDB adds the persistence layer:

- **Typed pipelines + durable state** — llm-exe executors for structured LLM calls, DialogueDB for persistence
- **Structured metadata** — intent and sentiment extracted by the JSON parser, stored as message metadata, queryable via API
- **Cold resume** — conversations survive restarts, deploys, and process crashes
- **Multi-provider** — swap `useLlm("openai.gpt-4o-mini")` for any llm-exe provider; DialogueDB doesn't care what LLM you use
