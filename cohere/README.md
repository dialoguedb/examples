# DialogueDB + Cohere SDK (V2 Chat API) Examples

Two examples showing how [DialogueDB](https://dialoguedb.com) persists AI conversations across sessions and cold restarts using the [Cohere SDK](https://docs.cohere.com/) V2 Chat API with [Command](https://docs.cohere.com/docs/command-r-plus) models.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You'll need:
- A [Cohere API key](https://dashboard.cohere.com/api-keys) (set as `CO_API_KEY`)
- A [DialogueDB API key](https://dialoguedb.com) (set as `DIALOGUEDB_API_KEY`)

## Hello World

The simplest proof of concept. Creates a conversation, chats with Command via the V2 Chat API, simulates a cold restart by loading the conversation fresh from DialogueDB, then continues chatting — Command retains full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Create a DialogueDB conversation
- Send messages to Command, persist every exchange
- Load the conversation from scratch (simulating a new process)
- Continue the conversation — Command remembers everything from before the restart

## Advanced

Full manual tool loop with cold resume.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Three tools: `get_weather`, `convert_temperature`, `save_note` with manual tool execution loop
- **Invocation 1**: Multi-tool agent loop — you implement the loop, Command calls tools, every message (including tool calls and tool results) is persisted to DialogueDB
- **Invocation 2**: Cold resume — loads the full conversation from DialogueDB, sends a follow-up with full prior context
- Token usage tracking in message metadata

### Running as separate processes

```bash
# Terminal 1
npm run advanced:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run advanced:2
```
