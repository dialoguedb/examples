# DialogueDB + Groq SDK Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations powered by [Groq](https://groq.com)'s ultra-fast LLM inference.

Groq delivers sub-second token generation — but like all LLM APIs, it's stateless. DialogueDB adds persistent conversation memory so your Groq-powered apps survive restarts, scale across services, and search past conversations by meaning.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

Get your keys:
- **Groq**: [console.groq.com/keys](https://console.groq.com/keys)
- **DialogueDB**: [dialoguedb.com](https://dialoguedb.com)

## Hello World

Creates a conversation, chats with Llama 3.3 via Groq, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Llama retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to Llama via Groq, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Llama remembers everything from before the restart

## Semantic Search

Shows how to use DialogueDB's semantic search to find relevant past messages and inject them as context for new Groq-powered conversations.

```bash
npm run search
```

**What it demonstrates:**
- Build up a multi-turn conversation with domain-specific content
- Search past messages by meaning, not just keywords
- Use search results as context in a new conversation — the LLM answers with knowledge from prior chats

## Why Groq + DialogueDB?

Groq's inference speed makes it ideal for real-time chat applications. DialogueDB complements this by handling the persistence layer:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **Semantic search** — find relevant past conversations by meaning to build richer context
- **API access** — any service can read or query conversations
- **Metadata** — track token usage, model info, and custom data alongside messages
