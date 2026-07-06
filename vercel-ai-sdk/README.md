# DialogueDB + Vercel AI SDK

Persistent chat for the Vercel AI SDK, backed by DialogueDB. The AI SDK is
stateless: every call takes the full message history. DialogueDB is where that
history lives between calls, so a `useChat` conversation survives a cold restart,
a deploy, or a new process, with no database to run.

This example runs the exact server-side flow a Next.js Route Handler would, then
reloads the conversation cold and continues it, so you can watch the history
round-trip as UI messages.

Requires `dialogue-db` >= 2.0.1 (message content is stored as structured parts).

## Setup

```bash
npm install
cp .env.example .env
# add your DialogueDB and OpenAI keys to .env
```

## Run

```bash
npm start
```

You will see turn 1, a cold reload from DialogueDB, then turn 2 continued from
the reloaded history, with the earlier turns still present.

## The idea

A `useChat` message is `{ id, role, parts }`. A DialogueDB message is
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
    messages: dialogue.messages.map((m) => ({ id: m.id, role: m.role, parts: m.content })),
  });
}
```

## Wiring it into a Next.js app

The route handler persists each turn and streams the reply. `convertToModelMessages`
is async in AI SDK v7, so it is awaited.

```ts
// app/api/chat/route.ts
import { streamText, convertToModelMessages } from "ai";
import { openai } from "@ai-sdk/openai";
import { DialogueDB } from "dialogue-db";
import { toStoredMessages } from "@/lib/persist";

const db = new DialogueDB();

export async function POST(req: Request) {
  const { messages, dialogueId, userId } = await req.json();

  const dialogue = await db.getOrCreateDialogue({ id: dialogueId, namespace: userId });

  // persist the incoming user turn
  await dialogue.saveMessages(toStoredMessages([messages[messages.length - 1]]));

  const result = streamText({
    model: openai("gpt-4o"),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: updated }) => {
      // persist the new assistant message(s)
      await dialogue.saveMessages(toStoredMessages(updated.slice(messages.length)));
    },
  });
}
```

The client loads history from DialogueDB on the server and hands it to `useChat`:

```tsx
// app/chat/[id]/page.tsx  (server component)
import { DialogueDB } from "dialogue-db";
import { loadUIMessages } from "@/lib/persist";
import { Chat } from "./chat";

const db = new DialogueDB();

export default async function Page({ params }: { params: { id: string } }) {
  const messages = await loadUIMessages(db, params.id, /* userId */ "user_123");
  return <Chat dialogueId={params.id} userId="user_123" initialMessages={messages} />;
}
```

```tsx
// app/chat/[id]/chat.tsx  (client component)
"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export function Chat({ dialogueId, userId, initialMessages }) {
  const { messages, sendMessage, status } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { dialogueId, userId },
    }),
  });
  // render messages, call sendMessage(...) on submit
}
```

Swap `openai(...)` for `anthropic(...)` or `google(...)` and the persistence code
does not change.
