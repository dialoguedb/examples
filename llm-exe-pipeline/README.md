# DialogueDB + llm-exe Pipeline: Intent-Routed Support Agent

Chain [llm-exe](https://llm-exe.com) executors into a classify-route-respond pipeline, with [DialogueDB](https://dialoguedb.com) persisting every message alongside its classification metadata. llm-exe makes each pipeline stage a typed, testable unit — but its executor output is ephemeral. DialogueDB captures the full conversation plus the structured routing decisions (intent, urgency, extracted entities) at each step, so on cold restart the specialist has complete context and every routing decision is auditable.

## What it does

Each user message flows through two chained llm-exe executors:

1. **Classifier** — `defineSchema` + JSON parser extracts intent, urgency, and key entities
2. **Specialist** — the classification result selects a domain-specific system prompt (billing, technical, account, general)

```
user message → [Classifier Executor] → intent / urgency / entities
                                              ↓
                [Specialist Executor] ← route by intent → response
                                              ↓
                [DialogueDB] ← persist message + classification metadata
```

The demo simulates a support conversation that escalates from a billing question to an urgent blocker, then resumes from cold to prove the full pipeline context survives.

## How it differs from the basic chatbot example

The [`llm-exe/`](../llm-exe) example uses a single executor in a loop. This example chains multiple executors with different parsers (JSON for classification, string for response), routes between specialist prompts based on structured output, and stores per-message classification metadata — the pattern production support systems actually use.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

You need:
- `DIALOGUEDB_API_KEY` — from [dialoguedb.com](https://dialoguedb.com)
- `DIALOGUEDB_ENDPOINT` — your DialogueDB endpoint
- `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com)

## Run

```bash
npm run pipeline          # Both invocations back-to-back
npm run pipeline:1        # Invocation 1 only (prints dialogue ID)
npm run pipeline:2        # Invocation 2 only (needs DIALOGUE_ID env)
```

### Running as separate processes

```bash
# Terminal 1
npm run pipeline:1

# Terminal 2 (paste the dialogue ID from above)
DIALOGUE_ID=<id> npm run pipeline:2
```

## How it works

**Invocation 1** runs three support messages through the pipeline. Each message:
1. Hits the classifier executor — extracts intent, urgency, and entities via a `defineSchema`-typed JSON parser
2. Routes to a specialist — the classified intent selects which system prompt generates the response
3. Persists to DialogueDB — both messages saved with classification metadata attached

**Invocation 2** simulates a cold restart. It loads the full conversation from DialogueDB, asks a recap question, and the specialist demonstrates it has full context from the previous session — including the order ID, plan name, and urgency from earlier messages.

## Why this pattern + DialogueDB?

llm-exe's strength is composable, typed executor pipelines — but each executor's output is fire-and-forget. DialogueDB adds the persistence layer that makes the pattern production-ready:

- **Structured routing audit trail** — every classification decision (intent, urgency, entities) is stored as message metadata, queryable via API
- **Cold resume** — conversations survive restarts, deploys, and process crashes with full pipeline context intact
- **Multi-provider** — swap `useLlm("openai.gpt-4o-mini")` for any llm-exe provider; DialogueDB doesn't care what LLM you use
- **Separation of concerns** — classification and response generation are independent, testable executors; DialogueDB handles durability
