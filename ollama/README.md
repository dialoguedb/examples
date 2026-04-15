# DialogueDB + Ollama

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts when using [Ollama](https://ollama.com) to run LLMs locally (Llama, Mistral, Qwen, Gemma, Phi, etc.).

## Why Ollama + DialogueDB?

Ollama gives you fast, private, local inference — but each `/api/chat` call is stateless, so your app owns the conversation history. DialogueDB gives that history a durable home:

- **Cross-device sync** — start a chat on your laptop, resume on another machine
- **Survives restarts** — conversations outlive process crashes, reboots, model swaps
- **Shared memory for multi-agent setups** — multiple local Ollama instances can read/write the same dialogue
- **Metadata tracking** — capture Ollama's timing and token counts per message for perf analysis
- **Searchable history** — query past conversations by label, tag, or content without rebuilding a local index

## Prerequisites

1. [Install Ollama](https://ollama.com/download) and make sure the server is running (`ollama serve`, or the desktop app).
2. Pull a model you want to use:
   ```bash
   ollama pull llama3.2
   ```
3. Get a DialogueDB API key from [dialoguedb.com](https://dialoguedb.com).

## Setup

```bash
npm install
cp .env.example .env
# Fill in your DialogueDB key and (optionally) OLLAMA_HOST / OLLAMA_MODEL
```

## Hello World

The simplest proof of concept. Creates a conversation, chats with a local model, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — the model retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to a local Ollama model, persist every exchange
- Load the conversation from scratch (simulating a new process / new device)
- Continue the conversation — the model remembers everything from before the restart

## Streaming

Streams tokens from Ollama to the terminal as they arrive, then persists the completed assistant message (one write per turn) with timing and token metadata.

```bash
npm run streaming
```

**What it demonstrates:**
- Token-by-token streaming from `ollama.chat({ stream: true })`
- Persisting the accumulated message to DialogueDB after the stream completes
- Capturing Ollama's `prompt_eval_count`, `eval_count`, and `total_duration` as message metadata so you can track per-message performance over time

## Configuration

| Env var                | Default                    | Purpose                                          |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| `DIALOGUEDB_API_KEY`   | —                          | Required — your DialogueDB API key               |
| `DIALOGUEDB_ENDPOINT`  | —                          | Required — DialogueDB API endpoint               |
| `OLLAMA_HOST`          | `http://127.0.0.1:11434`   | Where your Ollama server is listening            |
| `OLLAMA_MODEL`         | `llama3.2`                 | Any model you've pulled via `ollama pull <name>` |

## Files

- `src/hello-world.ts` — minimal end-to-end example with cold-restart resume
- `src/streaming.ts` — token streaming + per-message timing/token metadata
