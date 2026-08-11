# DialogueDB + Hugging Face Inference API

Persist conversations with open-source models hosted on [Hugging Face](https://huggingface.co/) using [DialogueDB](https://dialoguedb.com).

Run Llama, Mistral, Phi, or any chat model on the HF Inference API — DialogueDB handles conversation storage so the model retains full context across restarts, deploys, and cold starts.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- A [DialogueDB API key](https://dialoguedb.com)
- A [Hugging Face access token](https://huggingface.co/settings/tokens)

## Hello World

Creates a conversation, chats with an open-source model via the HF Inference API, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — the model retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Chat with an open-source model, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — the model remembers everything from before the restart

### Choosing a model

Set `HF_MODEL` in your `.env` to use any chat model on Hugging Face:

```bash
HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
HF_MODEL=microsoft/Phi-3-mini-4k-instruct
HF_MODEL=HuggingFaceH4/zephyr-7b-beta
```

Defaults to `mistralai/Mistral-7B-Instruct-v0.3` if not set.

## Why Hugging Face + DialogueDB?

The HF Inference API is stateless — every request needs the full message history. DialogueDB gives you:

- **Model portability** — switch between Llama, Mistral, Phi, or any model without changing your storage layer
- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **API access** — any service can read or query conversations
- **No vendor lock-in** — open-source models + portable conversation storage
