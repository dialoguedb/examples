# DialogueDB + Instructor

Two examples showing how [DialogueDB](https://dialoguedb.com) persists conversations for [Instructor](https://instructor-ai.github.io/instructor-js/) — structured LLM extraction powered by Zod schemas and OpenAI's tool calling.

## Why Instructor + DialogueDB?

Instructor turns LLM responses into typed objects. DialogueDB persists the conversation across sessions. Together:

- **Extraction accumulates** — each message adds context, and the structured output gets richer over time
- **Resume mid-flow** — user drops off during an intake, your bot picks up exactly where it left off
- **Audit trail** — every message that fed the extraction is stored and queryable

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Hello World

Extract a user profile that gets richer with each message. Cold restart — extraction resumes with full context.

```bash
npm run hello-world
```

**What it demonstrates:**
- Zod schema defines the extraction target (`UserProfile`)
- Each user message adds context, extraction accumulates
- DialogueDB persists the messages — cold restart doesn't lose context
- Post-restart extraction has the same quality as if the session never dropped

## Advanced

Two-process project intake that extracts a structured brief across sessions.

```bash
npm run advanced        # Run both invocations back-to-back
npm run advanced:1      # Run only invocation 1 (prints dialogue ID)
npm run advanced:2      # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- Nested Zod schemas with enums (`ProjectBrief` → `Feature` with priority levels)
- Completeness tracking — Instructor estimates how complete the brief is (0–100%)
- **Invocation 1**: User describes a project, Instructor extracts a partial brief
- **Invocation 2**: Loads the full conversation from DialogueDB, continues intake, completes the brief
- Dialogue state tracks the latest extraction across processes

### Running as separate processes

```bash
# Terminal 1
npm run advanced:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run advanced:2
```

