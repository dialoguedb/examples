# DialogueDB + LlamaIndex (OpenAI) Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using [LlamaIndex.TS](https://ts.llamaindex.ai/) — the TypeScript data framework for LLM applications.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

The simplest proof of concept. Creates a conversation, chats through LlamaIndex's `SimpleChatEngine`, simulates a cold restart by loading the conversation fresh from DialogueDB, rebuilds the engine with restored `Memory`, then continues chatting — the LLM retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Chat through LlamaIndex's `SimpleChatEngine`, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Rebuild the engine with `createMemory()` from loaded history
- Continue the conversation — the LLM remembers everything from before the restart

## Advanced

LlamaIndex `OpenAIAgent` with tool calling and cold resume.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `calculate`, `save_note` via LlamaIndex `FunctionTool`
- **Invocation 1**: The agent calls tools autonomously — every message (including tool calls and tool results) is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, reconstructs the agent's `chatHistory`, sends a follow-up with full prior context

### Running as separate processes

```bash
# Terminal 1
npm run advanced:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run advanced:2
```

## Key File: `persist.ts`

[`src/persist.ts`](src/persist.ts) holds the conversion both examples share:

- `toLlamaMessages(dialogue)` — stored messages to LlamaIndex `ChatMessage[]`
- `saveLlamaMessage(dialogue, message)` — persist a LlamaIndex message to DialogueDB

**Tool metadata round-trips through DialogueDB.** LlamaIndex stores tool call
and tool result data in each message's `options` field. Since DialogueDB has no
dedicated slot for that, `persist.ts` saves `options` in the message's
`metadata.llamaindex_options` and restores it on load. This means tool-calling
conversations survive a cold restart intact.

## Why LlamaIndex + DialogueDB?

LlamaIndex provides high-level abstractions — chat engines, agents, memory — so
you write less boilerplate. But its default memory is in-process and vanishes
when the process exits. DialogueDB fills that gap: every message is persisted
the moment it happens, and `createMemory()` or `chatHistory` restores the
full conversation in a single call.

## Project Structure

```
src/
  persist.ts       # Message conversion between DialogueDB and LlamaIndex
  hello-world.ts   # SimpleChatEngine chat, cold restart, resume
  advanced.ts      # OpenAIAgent with tools and cold resume
  tools.ts         # FunctionTool definitions and mock implementations
```
