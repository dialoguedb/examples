# DialogueDB + Replicate

Persist conversations with open-source models (Meta Llama, Mistral, etc.) running on [Replicate](https://replicate.com).

Replicate gives you access to thousands of open-source models without managing infrastructure. Unlike hosted APIs (OpenAI, Anthropic), Replicate doesn't store conversation history — you bring your own. DialogueDB handles that: save every message, survive restarts, and resume with full context.

## What it does

`hello-world.ts` — Creates a multi-turn conversation with Llama 3.1, persists it to DialogueDB, simulates a cold restart, and proves the model retains full context after reloading.

## Setup

1. **Get API keys:**
   - [Replicate API token](https://replicate.com/account/api-tokens)
   - [DialogueDB API key](https://dialoguedb.com)

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Fill in your keys
   ```

3. **Install and run:**
   ```bash
   npm install
   npm run hello-world
   ```

## How it works

```
User message → DialogueDB (save) → Build prompt from history → Replicate (Llama) → DialogueDB (save response)
                                                                    ↑
                                                       Cold restart? Load from DialogueDB
```

DialogueDB stores the full conversation. On each turn, the example loads the history, formats it into a prompt for Llama, and sends it to Replicate. After a simulated restart, the conversation resumes seamlessly — Llama picks up exactly where it left off.

## Swapping models

Change the `MODEL` constant to use any text generation model on Replicate:

```typescript
const MODEL = "meta/meta-llama-3.1-70b-instruct";   // Larger Llama
const MODEL = "mistralai/mistral-7b-instruct-v0.2";  // Mistral
```

The prompt formatting may need adjustment for non-Llama models — check the model's input schema on Replicate.
