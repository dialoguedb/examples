# DialogueDB + Amazon Bedrock (Converse API) Example

Shows how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Amazon Bedrock](https://aws.amazon.com/bedrock/) Converse API.

Bedrock's Converse API provides a unified interface for Claude, Llama, Mistral, Titan, and other models — but every request needs the full message history. DialogueDB stores that history so conversations survive restarts, deploys, and cold starts.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- A [DialogueDB](https://dialoguedb.com) API key and endpoint
- AWS credentials with Bedrock access (`bedrock:InvokeModel` permission)
- A Bedrock-enabled AWS region (e.g. `us-east-1`, `us-west-2`)

## Hello World

Creates a conversation, chats with a Bedrock model via the Converse API, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — the model retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages via Bedrock's Converse API, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — the model remembers everything from before the restart

## Switching models

Change the `MODEL_ID` constant to any Bedrock-supported model:

```typescript
// Claude
const MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";

// Llama
const MODEL_ID = "meta.llama3-1-70b-instruct-v1:0";

// Mistral
const MODEL_ID = "mistral.mistral-large-2407-v1:0";
```

DialogueDB stores messages in a model-agnostic format, so you can even switch models mid-conversation.

## Why Bedrock + DialogueDB?

Bedrock's Converse API is stateless — every request needs the full message history. DialogueDB gives you:

- **Cross-process persistence** — conversations survive restarts, deploys, cold starts
- **Model-agnostic storage** — switch between Bedrock models without changing your persistence layer
- **API access** — any service can read/query conversations
- **Metadata** — track model IDs, token usage, and custom data alongside messages
- **Searchability** — find conversations by label, tags, date, content
