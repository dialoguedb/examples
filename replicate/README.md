# DialogueDB + Replicate

Persistent chat for open-source models running on [Replicate](https://replicate.com), backed by DialogueDB.

Replicate lets you run open-source models (Llama, Mistral, etc.) on cloud GPUs via API. Its interface is prompt-based — each call takes a prompt string, not a messages array. DialogueDB stores the structured conversation history and converts it into prompts for each call, so a conversation survives a cold restart, a deploy, or a new process.

The demo runs a chat turn with Meta's Llama 3.1 8B Instruct, reloads the conversation cold from DialogueDB, and continues it — proving the history round-trips.

Requires `dialogue-db` >= 2.0.1.

## Setup

```bash
npm install
cp .env.example .env
# add your keys to .env
```

Get your keys:

- **REPLICATE_API_TOKEN** — [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)
- **DIALOGUE_DB_API_KEY** — [dialoguedb.com](https://dialoguedb.com)

## Run

```bash
npm start
```

You will see turn 1, a cold reload from DialogueDB, then turn 2 continued from the reloaded history.

## The idea

Replicate models are prompt-based, not message-based. The integration converts DialogueDB's `{ role, content }` messages into the `prompt` + `system_prompt` fields that Replicate expects. Prior exchanges are folded into the system prompt so the model retains conversational context. See [`src/persist.ts`](./src/persist.ts).

```ts
export function buildPrompt(dialogue: Dialogue) {
  const latest = dialogue.messages[dialogue.messages.length - 1];
  const prompt = String(latest.content);

  // Prior messages become context in the system prompt
  const prior = dialogue.messages.slice(0, -1);
  const history = prior
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${String(m.content)}`)
    .join("\n");

  return {
    systemPrompt: history
      ? `You are a helpful, concise assistant.\n\nPrevious conversation:\n${history}`
      : "You are a helpful, concise assistant.",
    prompt,
  };
}
```

Every read and write is scoped to a `namespace`, so one user can never load another user's history.

## Notes

- The default model is `meta/meta-llama-3.1-8b-instruct`. To use a different model, change the identifier in `src/index.ts`. Any Replicate text generation model that accepts `prompt` and `system_prompt` inputs will work.
- Same concept as [`../xai/`](../xai/) and [`../openai-sdk/`](../openai-sdk/) (turn, cold reload, continue), but integrated against Replicate's prompt-based API rather than an OpenAI-compatible one.

## Project structure

```
src/
  index.ts     # Chat turn, cold restart, resume
  persist.ts   # DialogueDB messages ↔ Replicate prompt conversion
```
