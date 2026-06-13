# OpenAI Chatbot — End-to-End Tutorial

Build a chatbot with OpenAI that uses DialogueDB for conversation memory and cross-conversation search.

## What it does

1. **Persists every message** — User and assistant messages are stored in DialogueDB as they happen
2. **Survives restarts** — Reload the full conversation from DialogueDB and continue where you left off
3. **Searches past conversations** — Use semantic search to find relevant context from earlier sessions and feed it to GPT

## Why DialogueDB?

Without DialogueDB, chat history lives in memory and vanishes when your server restarts. With DialogueDB, conversations persist — and you can search across them **by meaning**, so your chatbot recalls context from past sessions, not just the current one.

```
User message
  → Save to DialogueDB
  → Search past conversations for relevant context
  → Build GPT prompt with current history + retrieved context
  → GPT response
  → Save to DialogueDB
```

## Setup

1. **Get API keys:**
   - [DialogueDB](https://dialoguedb.com) — sign up for a free key
   - [OpenAI](https://platform.openai.com) — get an API key

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Fill in your API keys
   ```

3. **Install and run:**
   ```bash
   npm install
   npm start
   ```

## What happens when you run it

The example runs four parts in sequence:

**Part 1 — Seed past conversations.** Creates two short dialogues (travel planning, cooking help) to represent earlier chat sessions that have accumulated over time.

**Part 2 — Chat with persistence + search.** Starts a new multi-turn conversation with GPT. Each message is saved to DialogueDB. When the user asks about carbonara or Tokyo food, the chatbot searches past conversations and injects relevant context into the GPT prompt — so it can draw on knowledge from previous sessions.

**Part 3 — Cold restart.** Simulates a server restart by loading the conversation fresh from DialogueDB. Continues chatting with full history intact.

**Part 4 — Semantic search demo.** Searches across all stored conversations by meaning (not keywords), showing how DialogueDB finds relevant messages even when the search query uses different words than the original conversation.

## Key patterns

### Storing messages

```typescript
await dialogue.saveMessage({ role: "user", content: userMessage });
const reply = await chat(openAIMessages);
await dialogue.saveMessage({ role: "assistant", content: reply });
```

### Loading after restart

```typescript
const dialogue = await db.getDialogue(savedId);
await dialogue.loadMessages({ order: "asc" });
// dialogue.messages now has the full history
```

### Semantic search for cross-conversation context

```typescript
const results = await db.searchMessages("carbonara recipe", { limit: 3 });
// results contains messages from ANY past conversation that match
// inject them into the system prompt so GPT has the context
```

## Closes

[#28](https://github.com/dialoguedb/examples/issues/28) — end-to-end chatbot tutorial combining DialogueDB with an LLM
