# DialogueDB + Azure AI Inference

Persistent AI conversations using [Azure AI Model Inference](https://learn.microsoft.com/en-us/azure/ai-studio/reference/reference-model-inference-api) and [DialogueDB](https://dialoguedb.com). The Azure AI Inference SDK (`@azure-rest/ai-inference`) is Microsoft's unified client for chat completions across Azure-hosted models — GPT-4o, Llama, Mistral, and more.

**Why this combo?** Azure AI gives you access to dozens of models through one API. DialogueDB gives those conversations a memory that survives restarts, deploys, and cold starts. Together: pick any model, persist every conversation.

> **Also see:** [`../openai-sdk/`](../openai-sdk/) for OpenAI's own SDK, [`../anthropic-sdk/`](../anthropic-sdk/) for Anthropic's Claude SDK, [`../google-genai/`](../google-genai/) for Google Gemini.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

### Where to get credentials

**Option A — GitHub Models** (easiest, free tier available):

1. Go to [github.com/marketplace/models](https://github.com/marketplace/models)
2. Generate a personal access token at [github.com/settings/tokens](https://github.com/settings/tokens)
3. Set in `.env`:
   ```
   AZURE_AI_ENDPOINT=https://models.inference.ai.azure.com
   AZURE_AI_API_KEY=<your-github-token>
   AZURE_AI_MODEL=gpt-4o-mini
   ```

**Option B — Azure AI model deployment**:

1. Deploy a model in [Azure AI Studio](https://ai.azure.com)
2. Copy the endpoint URL and API key from the deployment
3. Set in `.env`:
   ```
   AZURE_AI_ENDPOINT=https://<your-deployment>.models.ai.azure.com
   AZURE_AI_API_KEY=<your-azure-key>
   AZURE_AI_MODEL=gpt-4o-mini
   ```

**DialogueDB:** Sign up at [dialoguedb.com](https://dialoguedb.com) and copy your API key.

## Run

```bash
npm run hello-world
```

The demo:
1. Creates a conversation with a system prompt
2. Chats with the model, persisting every message to DialogueDB
3. Simulates a cold restart — new client instance, no in-memory state
4. Continues the conversation — the model recalls details from before the restart

## How DialogueDB fits in

Azure AI's chat completions API is stateless — every request needs the full message history. DialogueDB stores that history so you can:

- **Resume across restarts** — conversations survive deploys, cold starts, crashes
- **Switch models** — the conversation history is model-agnostic; swap `AZURE_AI_MODEL` and keep going
- **Search and query** — find past conversations by content, tags, or metadata
- **Track usage** — token counts and custom metadata stored alongside each message

## Project structure

```
src/
  env.ts           # Environment variable helper
  persist.ts       # DialogueDB ↔ Azure AI message conversion
  hello-world.ts   # Chat, cold restart, resume
```
