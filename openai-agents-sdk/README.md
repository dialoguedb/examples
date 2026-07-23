# DialogueDB + OpenAI Agents SDK

Give an OpenAI Agents SDK agent memory that survives the process. The SDK
deliberately leaves durable storage to you: this is the explicit wiring that
loads a conversation before a run, seeds the run with it, and saves what the run
added, plus caller-controlled long-term memory and semantic search over it.

There is no `Session` adapter here. DialogueDB does not ship one, and this
example does not pretend otherwise. The wiring is four calls you can read.

## The loop

`result.history` is `AgentInputItem[]`, and `run()` takes
`string | AgentInputItem[] | RunState`. The types line up, so what you persist is
exactly what seeds the next run:

```ts
const history = await store.loadHistory(dialogueId); // from DialogueDB
const result = await run(agent, [
  ...history,
  { type: "message", role: "user", content: userText },
]);
await store.appendItems(dialogueId, result.history.slice(history.length));
```

## The part that is easy to get wrong

An `AgentInputItem` is a 17-member union and **only three members carry a `role`
at all** (user, assistant, system messages). Tool calls, tool results, and
reasoning carry none. Flattening to `{ role, content: string }` silently
destroys every tool call, and the assistant variant is rejected on the way back
in, because its `content` must be an array and `status` is required.

So the item is stored verbatim. DialogueDB's `MessageContent` is
`string | Record<string, any> | Record<string, any>[]`, which holds a structured
item as an object with no stringify and no lossy re-parse. Coming back, the
SDK's own Zod schema parses and validates it, so there is no type assertion:

```ts
export function fromStoredMessages(
  rows: readonly { content: unknown }[],
): AgentInputItem[] {
  return rows.map((row) => protocol.ModelItem.parse(row.content));
}
```

See [`persist.ts`](./src/persist.ts). That file is the whole integration.

## Multi-user isolation

Namespace is the user id and is threaded on every read and write. The DialogueDB
SDK is not uniform about where namespace goes (a field on the input object for
some calls, a field on a second options argument for others) and every one is
optional, so misplacing it compiles cleanly and silently uses the default
namespace. `conversationStore(db, namespace)` is the only place it is threaded,
so a caller cannot get it wrong.

## Setup

```bash
cp .env.example .env
# add your DialogueDB and OpenAI keys
```

## Run

```bash
npm start
```

You will see turn 1 make two real tool calls, a cold reload from DialogueDB
showing the `function_call` and `function_call_result` items came back, and turn
2 answering from that reloaded history plus a recalled memory.

## Memory is caller-controlled

Nothing is extracted automatically. The application decides what becomes a
memory (`createMemory` requires you to supply the value) and when to search:

```ts
await store.rememberFact(
  "demo-lisbon-trip", // a stable id keeps repeat runs idempotent
  "The user is planning a trip to Lisbon in October.",
);
const recalled = await store.recallFacts(userText); // searchMemories, scoped to the namespace
```

`searchMemories(query, options)` returns an envelope, not an array; the values
come from `response.results.map((r) => r.item.value)`.

## Runtime notes

The DialogueDB client is pure JS over HTTP with no native dependencies and no
database driver, so Node serverless (Lambda, Vercel Node functions) is fine. It
imports Node's `https` and keeps a keep-alive agent, so it does **not** run on
Vercel Edge, Cloudflare Workers, or Deno Deploy. Do not claim Edge support.

Resuming a run that paused on a tool approval is a separate path: use
`result.state`, not a replayed history, because approval placeholders are
filtered out of `history`.
