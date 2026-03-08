# DialogueDB + Vercel AI SDK

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations built with the [Vercel AI SDK](https://sdk.vercel.ai/) across sessions and cold restarts.

The Vercel AI SDK gives you a clean, provider-agnostic API for calling LLMs. But conversations live in memory — restart your process, lose your history. DialogueDB fixes that.

> **Also see:** [`../anthropic-sdk/`](../anthropic-sdk/) for the direct Anthropic Messages API integration, and [`../anthropic-agent-sdk/`](../anthropic-agent-sdk/) for the Claude Agent SDK integration.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest proof of concept. Chats with Claude via `generateText()`, persists every exchange to DialogueDB, simulates a cold restart, then continues — Claude retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Use Vercel AI SDK's `generateText()` with conversation history
- Persist every user/assistant message to DialogueDB
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Claude remembers everything

## Tool Calling

Full tool-calling flow with `maxSteps` for automatic tool loops, plus cold resume.

```bash
npm run tool-calling
```

**What it demonstrates:**
- Define tools with Vercel AI SDK's `tool()` helper and Zod schemas
- `maxSteps: 5` lets the SDK auto-execute tools and loop until done
- Three tools: `get_weather`, `calculate`, `save_note`
- Every message and tool call metadata persisted to DialogueDB
- Cold restart — loads full history, continues with new tool calls
- Token usage tracking in message metadata

## Why Vercel AI SDK + DialogueDB?

The Vercel AI SDK is great for **calling** LLMs. DialogueDB is great for **remembering** what happened.

| Without DialogueDB | With DialogueDB |
|---|---|
| Conversations lost on restart | Conversations survive restarts, deploys, cold starts |
| No way to resume a chat | Load any conversation by ID and continue |
| Tool call history gone | Full tool call trace persisted with metadata |
| Single-process only | Any process can pick up any conversation |

## Project Structure

```
src/
  hello-world.ts     # Simple chat with cold restart
  tool-calling.ts    # Multi-tool flow with cold restart
```
