# DialogueDB + Ollama

Persistent chat for local LLMs via [Ollama](https://ollama.com), backed by
DialogueDB. Ollama's chat API is stateless: every call takes the full message
history. DialogueDB is where that history lives between calls, so a conversation
survives a cold restart, a deploy, or a new process — with no extra database to
run.

This is ideal for local development and testing: run any open-weight model
(Llama, Mistral, Gemma, Phi, etc.) on your machine while DialogueDB handles
persistence and search. No cloud LLM API keys required.

Requires `dialogue-db` >= 2.0.1.

## Prerequisites

1. [Install Ollama](https://ollama.com/download) and start it
2. Pull a model: `ollama pull llama3.2`

## Setup

```bash
npm install
cp .env.example .env
# add your DialogueDB key to .env
```

Get your key:

- **DIALOGUE_DB_API_KEY** — [dialoguedb.com](https://dialoguedb.com)

## Run

```bash
npm start
```

You will see turn 1, a cold reload from DialogueDB, then turn 2 continued from
the reloaded history, with the earlier turn still present.

## The idea

A DialogueDB message is `{ role, content }`. Ollama's chat API takes the same
shape, so the whole integration is: save each turn as a row, reload the rows in
order, hand them straight back to the API. See
[`src/persist.ts`](./src/persist.ts).

```ts
export function toChatMessages(dialogue: Dialogue): OllamaMessage[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: String(m.content),
  }));
}
```

Every read and write is scoped to a `namespace`, so one user can never load
another user's history.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DIALOGUE_DB_API_KEY` | *(required)* | Your DialogueDB API key |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2` | Model to use for chat |
