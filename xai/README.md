# DialogueDB + xAI (Grok)

Grok speaks the OpenAI chat-completions protocol, so the official `openai`
client works against `api.x.ai/v1` with nothing but a different `baseURL`. The
API is stateless: every call resends the whole message array. These examples
keep that array in DialogueDB, so a conversation, including its tool calls,
survives restarts and cold starts.

> **Also see:** [`../openai-sdk/`](../openai-sdk/) for the same protocol against
> OpenAI, and [`../google-genai/`](../google-genai/) for Gemini.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

```bash
npm run hello-world
```

**What it demonstrates:**

- Pointing the `openai` client at `https://api.x.ai/v1`
- Storing every turn and rebuilding the message array from DialogueDB
- Cold restart: a new client, same dialogue id, full context

## Agent with Tools

```bash
npm run agent-with-tools
```

**What it demonstrates:**

- An assistant turn that requests `tool_calls`, stored verbatim
- Tool results stored as `role: "tool"` with their `tool_call_id`
- A cold restart that replays the whole tool exchange

## Key File: `persist.ts`

[`src/persist.ts`](src/persist.ts) holds the bridge:

- `toChatMessages(dialogue)` — stored messages to `ChatCompletionMessageParam[]`
- `toStoredToolCallTurn(text, toolCalls)` — an assistant tool turn, ready to store
- `loadDialogue(db, id, namespace)` — get-or-create, then load oldest first

Tool calling is the part worth reading. The protocol requires that an assistant
turn carrying `tool_calls` comes back with those calls intact, each paired with a
`role: "tool"` message quoting its `tool_call_id`. Drop or reshape either and the
next request is rejected. So the `tool_calls` array is stored as structured
content rather than flattened to text, and the `tool_call_id` rides in the
message metadata.

Content written by a different SDK is handled too: Anthropic content blocks and
Gemini parts are not valid OpenAI content, so `toMessageText` pulls their text
out and falls back to JSON rather than sending an empty message.

## Project Structure

```
src/
  persist.ts            # Message conversion, tool-call storage, loading
  hello-world.ts        # Chat, cold restart, resume
  agent-with-tools.ts   # Tool calls that survive a restart
```

## Why DialogueDB for Grok?

The protocol gives you no memory: you hand it the entire history every time.
Keeping that in memory loses the conversation on restart, and rebuilding it from
your own tables means owning the ordering and the tool-call round-tripping
yourself. DialogueDB stores structured content directly, so `tool_calls` come
back exactly as they were issued.
