# DialogueDB + Fireworks AI

Persistent chat with Fireworks AI's fast inference models, backed by DialogueDB.
Fireworks' API is stateless: every call takes the full message history. DialogueDB
is where that history lives between calls, so a conversation survives a cold
restart, a deploy, or a new process, with no database to run.

Fireworks AI is OpenAI-compatible, so this example uses the OpenAI SDK pointed at
`https://api.fireworks.ai/inference/v1`. The demo runs a chat turn, reloads the
conversation cold from DialogueDB, and continues it, so you can watch the history
round-trip.

Requires `dialogue-db` >= 2.0.1.

## Setup

```bash
npm install
cp .env.example .env
# add your DialogueDB and Fireworks keys to .env
```

Get your keys:

- **FIREWORKS_API_KEY** — [fireworks.ai/account/api-keys](https://fireworks.ai/account/api-keys)
- **DIALOGUE_DB_API_KEY** — [dialoguedb.com](https://dialoguedb.com)

## Run

```bash
npm start
```

You will see turn 1, a cold reload from DialogueDB, then turn 2 continued from
the reloaded history, with the earlier turns still present.

## The idea

A DialogueDB message is `{ role, content }`. Fireworks' chat API takes the same
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

- The default model is `accounts/fireworks/models/llama-v3p3-70b-instruct`. Set
  `FIREWORKS_MODEL` in `.env` to use a different model; Fireworks serves Llama,
  Mixtral, Qwen, DeepSeek, and more — see the
  [model list](https://fireworks.ai/models).
- Same concept as [`../xai/`](../xai/) (turn, cold reload, continue), but
  integrated against the Fireworks API rather than xAI.
