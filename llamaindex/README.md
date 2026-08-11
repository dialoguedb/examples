# DialogueDB + LlamaIndex.TS

Persistent chat memory for [LlamaIndex.TS](https://ts.llamaindex.ai/) applications using [DialogueDB](https://dialoguedb.com).

LlamaIndex's built-in `ChatMemoryBuffer` lives in-memory — when the process exits, the conversation is gone. This example shows how DialogueDB gives LlamaIndex chat engines durable, cross-process memory that survives restarts.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- A [DialogueDB](https://dialoguedb.com) API key and endpoint
- An [OpenAI](https://platform.openai.com) API key (LlamaIndex uses OpenAI by default)

## Hello World

Creates a conversation, chats through LlamaIndex's `SimpleChatEngine`, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — the LLM retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation alongside a LlamaIndex chat engine
- Persist every message exchange to DialogueDB
- Simulate a cold restart (new engine instance, history loaded from DialogueDB)
- Feed the history back via `chatHistory` — the LLM remembers everything from before the restart

## Why LlamaIndex + DialogueDB?

LlamaIndex handles orchestration — chat engines, RAG pipelines, agents. But its memory is ephemeral. DialogueDB adds:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **Decoupled storage** — any service can read conversation history via the DialogueDB API
- **Searchability** — find conversations by label, tags, date, or content
- **Framework-agnostic history** — the same DialogueDB conversation can be loaded into LlamaIndex, LangChain, or raw API calls
