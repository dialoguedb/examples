# DialogueDB + Mistral AI SDK Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Mistral AI SDK](https://github.com/mistralai/client-ts).

> **Also see:** [`../openai-sdk/`](../openai-sdk/) and [`../anthropic-sdk/`](../anthropic-sdk/) for the same patterns with other providers.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You'll need:
- A [DialogueDB](https://dialoguedb.com) API key and endpoint
- A [Mistral AI](https://console.mistral.ai) API key

## Hello World

The simplest proof of concept. Creates a conversation, chats with Mistral, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Mistral retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to Mistral, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Mistral remembers everything from before the restart

## Streaming

Real-time streaming with persistence. Streams responses from Mistral (printing chunks as they arrive), saves the complete response to DialogueDB once streaming finishes, then proves context survives a cold restart.

```bash
npm run streaming
```

**What it demonstrates:**
- Stream Mistral responses in real time using `chat.stream()`
- Accumulate streamed chunks into a complete response
- Persist the full response to DialogueDB after streaming
- Cold restart with full context — streamed responses are fully recoverable

## Why Mistral + DialogueDB?

Mistral's Chat API is stateless — every request needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read/query conversations
- **Metadata** — track token usage, costs, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, content
