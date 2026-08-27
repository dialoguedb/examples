# DialogueDB RAG Pipeline

A retrieval-augmented generation (RAG) pipeline using [DialogueDB](https://dialoguedb.com) as both the knowledge store and conversation memory, with [OpenAI](https://platform.openai.com/docs/api-reference) for answer generation.

## What it does

Most RAG setups need a separate vector database for retrieval and another store for conversation history. DialogueDB handles both — its built-in semantic search lets you store knowledge articles as messages and retrieve them by meaning, while also persisting the Q&A conversation.

The pipeline:

1. **Ingest** — stores knowledge articles as messages in a DialogueDB dialogue tagged `"knowledge"`
2. **Retrieve** — when the user asks a question, `searchMessages` finds the most relevant articles by meaning
3. **Generate** — retrieved context + conversation history are sent to GPT for a grounded answer
4. **Persist** — the Q&A exchange is saved to a separate conversation dialogue

Follow-up questions benefit from both fresh retrieval (new context per question) and conversation history (GPT remembers what was discussed).

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Run

```bash
npm start
```

The example ingests 8 knowledge articles about a fictional API platform, then runs a 3-question Q&A session showing retrieval + conversation memory working together.

## Why DialogueDB for RAG?

- **One store, two roles** — knowledge retrieval and conversation persistence in a single service
- **Semantic search built in** — no embedding pipeline to build or maintain
- **Tag-scoped retrieval** — `tags: ["knowledge"]` keeps search results focused on your knowledge base, not conversation noise
- **Conversation context** — GPT sees the full Q&A history alongside retrieved context, so follow-ups work naturally
