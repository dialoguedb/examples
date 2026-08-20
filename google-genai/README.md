# DialogueDB + Google Gemini

Gemini's `@google/genai` client is stateless: `generateContent` takes the whole
conversation as a `Content[]` on every call, and `chats.create({ history })`
seeds a chat from one. Nothing is retained between processes. These examples
store every turn in DialogueDB and rebuild that array on demand, so a
conversation survives restarts, deploys, and serverless cold starts.

> **Also see:** [`../anthropic-sdk/`](../anthropic-sdk/) and [`../xai/`](../xai/)
> for the same pattern with other providers.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

Chats with Gemini, simulates a cold restart, and continues with full context.

```bash
npm run hello-world
```

**What it demonstrates:**

- Storing every turn and rebuilding `Content[]` from DialogueDB
- `assistant` mapped back to Gemini's `model` role
- A stored `system` message reaching Gemini as a `systemInstruction`
- Cold restart: a new client, same dialogue id, full context

## Advanced

```bash
npm run advanced
```

**What it demonstrates:**

- A function-calling turn stored as its `parts` array, so the `functionCall`
  and `functionResponse` round-trip verbatim
- Reading a dialogue written by a **different SDK** without failing

## Key File: `persist.ts`

[`src/persist.ts`](src/persist.ts) holds the whole bridge:

- `toGeminiContents(dialogue)` — stored messages to `Content[]`
- `toSystemInstruction(dialogue)` — stored `system` messages, joined
- `loadDialogue(db, id, namespace)` — get-or-create, then load oldest first

Two details are worth knowing, because both are easy to get wrong.

**System messages are not turns.** Gemini takes them as a top-level
`systemInstruction`. Folding them into `contents` as a `user` turn makes the
model answer the instruction as if it were the question, so
`toGeminiContents` filters them out and `toSystemInstruction` returns them
separately.

**Not every stored array is a Gemini `parts` array.** A dialogue is meant to be
shared across SDKs, and the Anthropic examples store content blocks shaped like
`{ type: "tool_use", ... }`. Gemini validates every part against its own oneof
and rejects anything else outright:

```
GenerateContentRequest.contents[1].parts[1].data:
required oneof field 'data' must have one initialized field
```

So `persist.ts` forwards parts Gemini already understands and serializes
anything else to text. The information still reaches the model instead of the
request failing.

## Project Structure

```
src/
  persist.ts       # Content[] conversion and dialogue loading
  hello-world.ts   # Chat, cold restart, resume
  advanced.ts      # Function calling and cross-SDK content
```

## Why DialogueDB for Gemini?

`chats.create({ history })` is only as good as the history you can hand it.
Keeping that array in memory means losing the conversation on every restart,
and rebuilding it from your own tables means writing the storage, the ordering,
and the tool-call round-tripping yourself. DialogueDB stores structured content
directly, so a `functionCall` comes back exactly as it went in.
