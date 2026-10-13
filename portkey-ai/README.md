# DialogueDB + Portkey AI Gateway

Use [Portkey](https://portkey.ai) as a unified gateway to 250+ LLM providers (OpenAI, Anthropic, Google, Mistral, Cohere, and more) while [DialogueDB](https://dialoguedb.com) persists every conversation across sessions and cold restarts.

> **Also see:** [`../openai-sdk/`](../openai-sdk/) for direct OpenAI integration, or [`../anthropic-sdk/`](../anthropic-sdk/) for Anthropic.

## Why Portkey + DialogueDB?

Portkey gives you a single API for every LLM provider, plus production features like automatic fallbacks, retries, load balancing, semantic caching, and observability — all without changing your code.

DialogueDB gives you persistent conversation storage. Together, you get:

- **Provider portability** — switch from GPT-4o to Claude to Gemini by changing a virtual key, without losing conversation history
- **Production reliability** — Portkey handles retries and fallbacks; DialogueDB handles persistence
- **Cross-process memory** — conversations survive restarts, deploys, and cold starts
- **Full observability** — Portkey traces every LLM call; DialogueDB stores every message

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You'll need:
1. A **DialogueDB** API key — sign up at [dialoguedb.com](https://dialoguedb.com)
2. A **Portkey** API key — sign up at [portkey.ai](https://portkey.ai)
3. A **Portkey virtual key** — add your LLM provider's API key (e.g. OpenAI) to [Portkey's vault](https://app.portkey.ai/virtual-keys) and copy the virtual key

## Hello World

Creates a conversation, chats through Portkey's AI gateway, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues — the LLM retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages through Portkey's unified API, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — the LLM remembers everything from before the restart

## Switching providers

Portkey's virtual keys abstract away provider-specific authentication. To switch from OpenAI to Anthropic (or any other provider), just update `PORTKEY_VIRTUAL_KEY` in your `.env` to point to a different provider's key in Portkey's vault. Your conversation history in DialogueDB stays intact — the LLM gets full context regardless of which provider answers.
