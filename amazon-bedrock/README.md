# DialogueDB + Amazon Bedrock

Use Amazon Bedrock's [Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html) with DialogueDB to persist multi-turn conversations. Every message — including structured tool-call blocks — is stored so the model picks up exactly where it left off, even across Lambda invocations or container restarts.

> **Also see:** [OpenAI SDK](../openai-sdk), [Anthropic SDK](../anthropic-sdk), [Google Gemini](../google-genai)

## Setup

```bash
npm install
cp .env.example .env
# Fill in your AWS credentials and DialogueDB API key
```

Your AWS account must have [model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) enabled for the model you want to use. The default is Claude Sonnet 4 on Bedrock (`anthropic.claude-sonnet-4-20250514-v1:0`).

## Hello World

```bash
npm run hello-world
```

What it demonstrates:

- Creating a dialogue with a system prompt
- Multi-turn conversation via Bedrock's Converse API
- Cold restart — new DialogueDB client, conversation reloaded from scratch
- Follow-up that proves the model remembers context from before the restart

## Advanced

```bash
npm run advanced
```

What it demonstrates:

- **Tool calling** — Bedrock Converse API tool use, with both `toolUse` and `toolResult` blocks persisted as structured content in DialogueDB
- **Cross-SDK content** — blocks written by another SDK (e.g. Anthropic's `{ type: "tool_use" }`) are normalized to text so the conversation stays portable

## Key File: `persist.ts`

The bridge between DialogueDB and Bedrock. Three things to know:

1. **System prompt** — Bedrock takes system instructions as a top-level parameter, not inside messages. `toSystemPrompt` extracts stored system messages separately.
2. **Structured content** — Tool calls produce arrays of content blocks (`toolUse`, `toolResult`). These round-trip through DialogueDB without flattening.
3. **Cross-SDK normalization** — Content blocks from other SDKs (like Anthropic's `{ type: "tool_use" }`) don't match Bedrock's key-based format, so they're serialized to text rather than dropped.

## Project Structure

```
amazon-bedrock/
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── env.ts          # requireEnv helper
    ├── persist.ts      # DialogueDB ↔ Bedrock conversion
    ├── hello-world.ts  # Multi-turn chat with cold restart
    └── advanced.ts     # Tool calling + cross-SDK content
```

## Why DialogueDB for Bedrock?

The Converse API is stateless — you send the full message history on every call. DialogueDB gives you a conversation store purpose-built for this pattern:

- **No state management** — every message is saved as it happens, ready to reload
- **Structured content** — tool call blocks store as-is, no serialization hacks
- **Cross-service** — the same dialogue works across Lambda functions, ECS tasks, or Step Functions
- **Built-in search** — find past conversations by content without a separate index
