# DialogueDB + Cerebras

Persistent chat powered by Cerebras — the fastest inference available — with
conversation history stored in DialogueDB. Cerebras's API is stateless: every
call takes the full message history. DialogueDB is where that history lives
between calls, so a conversation survives a cold restart, a deploy, or a new
process, with no database to run.

The demo runs a chat turn, reloads the conversation cold from DialogueDB, and
continues it, so you can watch the history round-trip.

Requires `dialogue-db` >= 2.0.1.

## Setup

```bash
npm install
cp .env.example .env
# add your DialogueDB and Cerebras keys to .env
```

Get your keys:

- **CEREBRAS_API_KEY** — [cloud.cerebras.ai](https://cloud.cerebras.ai/)
- **DIALOGUE_DB_API_KEY** — [dialoguedb.com](https://dialoguedb.com)

## Run

```bash
npm start
```

You will see turn 1, a cold reload from DialogueDB, then turn 2 continued from
the reloaded history, with the earlier turns still present.

## The idea

A DialogueDB message is `{ role, content }`. The Cerebras chat API takes the
same shape, so the whole integration is: save each turn as a row, reload the
rows in order, hand them straight back to the API. See
[`src/persist.ts`](./src/persist.ts).

```ts
export function toChatMessages(dialogue: Dialogue): ChatMessage[] {
  return dialogue.messages.map((m): ChatMessage => {
    const content = String(m.content);
    switch (m.role) {
      case "user":
        return { role: "user", content };
      case "system":
        return { role: "system", content };
      default:
        return { role: "assistant", content };
    }
  });
}
```

Every read and write is scoped to a `namespace`, so one user can never load
another user's history.

## Notes

- The default model is `gpt-oss-120b`. Override with `CEREBRAS_MODEL` in `.env`
  if your key does not have access to it.
- TCP warming is disabled in this demo to keep startup simple. In production,
  leave it enabled (the default) for lower time-to-first-token.
