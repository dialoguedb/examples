# Persist and Resume a Conversation

A minimal [DialogueDB](https://dialoguedb.com) example showing the most common use case: **save a conversation, leave, come back, and pick up where you left off.**

This is a stepping stone between the [quickstart](https://dialoguedb.com/docs) (basic CRUD) and the [full integration examples](../) (complete apps with LLM SDKs). No LLM API key needed — just DialogueDB.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your DialogueDB API key and endpoint
```

## Run

```bash
npm start
```

## What it demonstrates

1. **Create** a conversation with a label and tags
2. **Save** messages from both the user and assistant
3. **Simulate** the user leaving (a cold restart / new process)
4. **Resume** by loading the conversation from DialogueDB using the saved ID
5. **Continue** adding messages to the same conversation

## Integrating with your LLM

Once you load the conversation history, pass it to any LLM as context:

```typescript
const resumed = await db.getDialogue(savedId);
await resumed.loadMessages({ order: "asc" });

// Convert to the format your LLM expects
const history = resumed.messages.map((m) => ({
  role: m.role,
  content: m.content,
}));

// Pass to your LLM (Anthropic, OpenAI, LangChain, etc.)
const response = await llm.chat({ messages: history });
```

## Next steps

Once you're comfortable with persist and resume, check out the full integration examples:

- [`../anthropic-sdk/`](../anthropic-sdk/) — Direct Claude API with tool calling
- [`../langchain/`](../langchain/) — LangChain agent with custom chat history
- [`../hono/`](../hono/) — REST API server with persistent chat
- [`../discord-bot/`](../discord-bot/) — Discord bot with per-channel memory
- [`../anthropic-agent-sdk/`](../anthropic-agent-sdk/) — Claude Agent SDK with audit logging
