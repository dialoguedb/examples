# DialogueDB + Anthropic SDK (Messages API) Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Anthropic SDK](https://docs.anthropic.com/en/api/client-sdks) Messages API directly.

> **Also see:** [`../anthropic-agent-sdk/`](../anthropic-agent-sdk/) for the same integration using the Claude Agent SDK (autonomous agents with built-in tools).

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest proof of concept. Creates a conversation, chats with Claude via the Messages API, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Claude retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to Claude, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Claude remembers everything from before the restart

## Advanced

Full manual tool loop with prompt caching and cold resume.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `calculate`, `save_note` with manual tool execution loop
- **Invocation 1**: Multi-tool agent loop — you implement the loop, Claude calls tools, every message (including `tool_use`/`tool_result` blocks) is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, reconstructs messages with prompt cache hints, sends a follow-up with full prior context
- Token usage tracking in message metadata

### Running as separate processes

```bash
# Terminal 1
npm run advanced:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run advanced:2
```

## Key File: `persist.ts`

[`src/persist.ts`](src/persist.ts) holds the conversion both examples share:

- `toMessageParams(dialogue)` — stored messages to `Anthropic.MessageParam[]`
- `toSystemPrompt(dialogue)` — stored `system` messages, joined
- `withCacheHint(messages)` — a prompt-cache breakpoint on the final block
- `loadDialogue(db, id, namespace)` — get-or-create, then load oldest first

Two details matter here.

**A system prompt is not a message.** The Messages API accepts only `user` and
`assistant` in `messages[]` and rejects anything else outright:

```
messages.0: use the top-level 'system' parameter for the initial system prompt
```

So `toMessageParams` filters system messages out and `toSystemPrompt` returns
them for the top-level `system` parameter.

**Assistant content is an array of blocks.** `dialogue-db` stores structured
content as-is, so `response.content` round-trips verbatim and `tool_use` /
`tool_result` blocks survive a restart without being flattened to text. That is
what makes the cold resume in invocation 2 work.

`withCacheHint` returns new objects rather than writing `cache_control` onto the
blocks it was given, since those blocks belong to the dialogue.

## Project Structure

```
src/
  persist.ts       # Message conversion, system prompt, cache hints
  hello-world.ts   # Chat, cold restart, resume
  advanced.ts      # Multi-tool agent loop and cold resume with caching
  tools.ts         # Tool schemas and execution
```
