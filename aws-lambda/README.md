# AWS Lambda + DialogueDB

A stateless [AWS Lambda](https://aws.amazon.com/lambda/) chat handler that uses [DialogueDB](https://dialoguedb.com) for conversation persistence and [OpenAI](https://openai.com) for AI responses.

## Why this matters

Lambda functions are stateless — every invocation starts with zero memory. For a chatbot, that means the AI can't remember what a user said 30 seconds ago. The typical fix is a pile of infrastructure: DynamoDB tables, ElastiCache clusters, session management code.

DialogueDB replaces all of that. One API call loads the conversation. One API call saves the new message. The Lambda stays stateless; DialogueDB provides the memory.

## What's included

| File | Description |
|------|-------------|
| `src/handler.ts` | Lambda function handler — deploy this behind API Gateway |
| `src/demo.ts` | Local demo that simulates 3 cold-start invocations |

## Setup

```bash
npm install
cp .env.example .env
# Fill in your keys:
#   DIALOGUEDB_API_KEY  — from https://dialoguedb.com
#   DIALOGUEDB_ENDPOINT — from your DialogueDB dashboard
#   OPENAI_API_KEY      — from https://platform.openai.com
```

## Run the demo

```bash
npm run demo
```

The demo simulates three separate Lambda invocations (each with a fresh `DialogueDB` instance — no shared in-memory state). It proves that conversation context survives across cold starts:

1. **Invocation 1** — starts a conversation, gets a response
2. **Invocation 2** — sends a follow-up using only the `conversationId`
3. **Invocation 3** — asks for a recap, verifying the AI remembers everything

## Deploy to AWS

Bundle the handler with your preferred tool (esbuild, webpack, SAM, SST, etc.) and deploy behind API Gateway:

```
POST /chat
Body: { "conversationId": "optional-id", "message": "Hello!" }
  →  { "conversationId": "abc123", "reply": "Hi there!" }
```

The client stores the `conversationId` from the first response and sends it back on subsequent requests. DialogueDB handles the rest.

### Environment variables

Set these in your Lambda configuration:

- `DIALOGUEDB_API_KEY`
- `DIALOGUEDB_ENDPOINT`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)
