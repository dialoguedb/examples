# DialogueDB + Together AI

Persistent chat with open-source models, backed by DialogueDB. Together AI
hosts dozens of open-source LLMs (Llama, Mixtral, Qwen, DeepSeek, and more)
behind a simple chat completions API. That API is stateless — every call needs
the full message history. DialogueDB is where that history lives between calls,
so a conversation survives a cold restart, a deploy, or a new process.

This example uses the official [Together AI SDK](https://www.npmjs.com/package/together-ai)
and demonstrates: run a chat turn, reload the conversation cold from DialogueDB,
and continue it with full context.

Requires `dialogue-db` >= 2.0.1.

## Setup

```bash
npm install
cp .env.example .env
# add your DialogueDB and Together AI keys to .env
```

Get your keys:

- **TOGETHER_API_KEY** — [api.together.ai](https://api.together.ai)
- **DIALOGUE_DB_API_KEY** — [dialoguedb.com](https://dialoguedb.com)

## Run

```bash
npm start
```

You will see turn 1, a cold reload from DialogueDB, then turn 2 continued from
the reloaded history with the earlier context still present.

## How it works

A DialogueDB message is `{ role, content }`. Together AI's chat API takes the
same shape, so the whole integration is: save each turn as a row, reload the
rows in order, hand them straight back to the API. See
[`src/persist.ts`](./src/persist.ts).

Every read and write is scoped to a `namespace`, so one user can never load
another user's history.

## Notes

- The default model is `meta-llama/Llama-3.3-70B-Instruct-Turbo`. Override it
  with `TOGETHER_MODEL` in `.env`. Browse the full model list at
  [together.ai/models](https://www.together.ai/models).
- Same concept as [`../xai/`](../xai/) and [`../openai-sdk/`](../openai-sdk/)
  (turn, cold reload, continue), but using Together AI's open-source model
  catalog.
