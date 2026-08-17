# DialogueDB + xAI (Grok)

Persistent chat for xAI's Grok models, backed by DialogueDB. The xAI API is
stateless: every call takes the full message history. DialogueDB is where that
history lives between calls, so a conversation survives a cold restart, a
deploy, or a new process, with no database to run.

This example uses the AI SDK's [xAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/xai)
(`@ai-sdk/xai`) and runs the exact server-side flow a Route Handler would, then
reloads the conversation cold and continues it, so you can watch the history
round-trip.

Requires `dialogue-db` >= 2.0.1 (message content is stored as structured parts).

> **Also see:** [`../vercel-ai-sdk/`](../vercel-ai-sdk/) — the same integration
> against OpenAI. [`src/persist.ts`](./src/persist.ts) is identical in both, on
> purpose: the DialogueDB side does not change when the model provider does.

## Setup

```bash
npm install
cp .env.example .env
# add your DialogueDB and xAI keys to .env
```

Get your keys:

- **XAI_API_KEY** — [console.x.ai](https://console.x.ai)
- **DIALOGUE_DB_API_KEY** — [dialoguedb.com](https://dialoguedb.com)

## Run

```bash
npm start
```

You will see turn 1, a cold reload from DialogueDB, then turn 2 continued from
the reloaded history, with the earlier turns still present.

## The idea

A UI message is `{ id, role, parts }`. A DialogueDB message is
`{ id, role, content }`. Store the `parts` array as `content` (DialogueDB keeps
it structured, so text, tool calls, and reasoning survive) and map back on load.
DialogueDB owns the message id, which stays stable across reloads. That mapping
is the whole integration; see [`src/persist.ts`](./src/persist.ts).

```ts
export function toStoredMessages(messages: UIMessage[]) {
  return messages.map((m) => ({ role: m.role, content: m.parts }));
}

// On load, validateUIMessages parses the stored rows back into typed UIMessages,
// so there is no casting at the storage boundary.
export async function loadUIMessages(db, id, namespace) {
  const dialogue = await db.getDialogue(id, { namespace });
  if (!dialogue) return [];
  await dialogue.loadMessages({ order: "asc" });
  return validateUIMessages({
    messages: dialogue.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.content,
    })),
  });
}
```

Every read and write is scoped to a `namespace`, so one user can never load
another user's history.

## Notes

- The default model is `grok-4.20-0309-non-reasoning` (verified against the
  live model list). If your key does not have it, set `XAI_MODEL` in `.env` to
  any Grok chat model; list what your key can use with
  `GET https://api.x.ai/v1/language-models`.
- Swapping providers is a one-line change: this example and
  [`../vercel-ai-sdk/`](../vercel-ai-sdk/) differ only in the provider import
  and model id.
