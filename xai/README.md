# DialogueDB + xAI (Grok)

Persistent chat for xAI's Grok models, backed by DialogueDB. The xAI API is
stateless: every call takes the full message history. DialogueDB is where that
history lives between calls, so a conversation survives a cold restart, a
deploy, or a new process, with no database to run.

xAI has no official JS SDK; its documented JS path is the OpenAI SDK pointed at
`https://api.x.ai/v1` (the API is OpenAI-compatible), which is what this example
uses. The demo runs a chat turn, reloads the conversation cold from DialogueDB,
and continues it, so you can watch the history round-trip.

Requires `dialogue-db` >= 2.0.1.

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

A DialogueDB message is `{ role, content }`. xAI's chat API takes the same
shape, so the whole integration is: save each turn as a row, reload the rows in
order, hand them straight back to the API. See
[`src/persist.ts`](./src/persist.ts).

```ts
export function toChatMessages(dialogue: Dialogue) {
  return dialogue.messages.map((m) =>
    m.role === "user"
      ? { role: "user", content: String(m.content) }
      : { role: "assistant", content: String(m.content) },
  );
}

export async function loadDialogue(db, id, namespace) {
  const dialogue = await db.getDialogue(id, { namespace });
  if (!dialogue) return null;
  await dialogue.loadMessages({ order: "asc" });
  return dialogue;
}
```

Every read and write is scoped to a `namespace`, so one user can never load
another user's history.

## Notes

- The default model is `grok-4.20-0309-non-reasoning` (verified against the
  live model list). If your key does not have it, set `XAI_MODEL` in `.env` to
  any Grok chat model; list what your key can use with
  `GET https://api.x.ai/v1/language-models`.
- Same concept as [`../vercel-ai-sdk/`](../vercel-ai-sdk/) (turn, cold reload,
  continue), but integrated directly against the xAI API rather than through a
  framework.
