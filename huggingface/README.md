# DialogueDB + Hugging Face Inference

Persist AI conversations across cold restarts using [DialogueDB](https://dialoguedb.com) with the [Hugging Face Inference](https://huggingface.co/docs/huggingface.js/inference/README) client.

Hugging Face Inference gives you access to thousands of models — Llama, Mistral, Qwen, and more — through a single SDK. This example shows how to persist those conversations so they survive process restarts, deploys, and cold starts.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- A **DialogueDB API key** — free at [dialoguedb.com](https://dialoguedb.com)
- A **Hugging Face access token** — free at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

## Hello World

Creates a conversation, chats with Llama via Hugging Face Inference, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — the model retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to a Hugging Face model, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — the model remembers everything from before the restart

## Using a Different Model

Change the `MODEL` constant in `src/hello-world.ts` to any chat model available on Hugging Face:

```typescript
const MODEL = "mistralai/Mistral-7B-Instruct-v0.3";
```

## Why Hugging Face Inference + DialogueDB?

Hugging Face's chat completion API is stateless — every request needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **Model flexibility** — switch models mid-conversation without losing history
- **API access** — any service can read/query conversations
- **Metadata** — track token usage alongside messages
- **Searchability** — find conversations by namespace, tags, date, content
