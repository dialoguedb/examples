# DialogueDB + AI21 Labs (Jamba)

Persistent chat for AI21's Jamba models, backed by DialogueDB. AI21's chat API
is stateless: every call takes the full message history. DialogueDB is where that
history lives between calls, so a conversation survives a cold restart, a deploy,
or a new process, with no database to run.

The demo runs a chat turn, reloads the conversation cold from DialogueDB, and
continues it, so you can watch the history round-trip.

Requires `dialogue-db` >= 2.0.1.

## Setup

```bash
npm install
cp .env.example .env
# add your DialogueDB and AI21 keys to .env
```

Get your keys:

- **AI21_API_KEY** — [studio.ai21.com](https://studio.ai21.com)
- **DIALOGUE_DB_API_KEY** — [dialoguedb.com](https://dialoguedb.com)

## Run

```bash
npm start
```

You will see turn 1, a cold reload from DialogueDB, then turn 2 continued from
the reloaded history, with the earlier turns still present.

## The idea

A DialogueDB message is `{ role, content }`. AI21's chat API takes the same
shape, so the whole integration is: save each turn as a row, reload the rows in
order, hand them straight back to the API. See
[`src/persist.ts`](./src/persist.ts).

```ts
export function toChatMessages(dialogue: Dialogue): AI21Message[] {
  return dialogue.messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.content),
  }));
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

- The default model is `jamba-mini`. To use a different Jamba model, change
  the `MODEL` constant in `src/index.ts`. See the
  [AI21 model docs](https://docs.ai21.com/docs/models-overview) for available
  models.
- Same concept as [`../xai/`](../xai/) (turn, cold reload, continue), but
  using AI21's native TypeScript SDK rather than an OpenAI-compatible shim.
