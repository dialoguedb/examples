# DialogueDB + LangGraph

A graph-based ReAct agent with persistent conversation memory, powered by [LangGraph](https://github.com/langchain-ai/langgraphjs) and [DialogueDB](https://dialoguedb.com).

LangGraph gives you explicit control over the agent's execution loop — you define nodes, edges, and routing as a graph. DialogueDB persists every conversation across restarts, deploys, and serverless cold starts. Together, you get a controllable agent that never loses context.

> **Also see:** [`../langchain/`](../langchain/) for simpler chain-based patterns using LangChain directly.

## Setup

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
```

## Agent with Tools

A tool-calling agent built as an explicit state graph. The model decides when to call tools, and the graph routes between the model and tool nodes automatically.

```bash
npm run agent          # Run both invocations back-to-back
npm run agent:1        # Run only invocation 1 (prints dialogue ID)
npm run agent:2        # Run only invocation 2 (needs DIALOGUE_ID env)
```

**What it demonstrates:**
- `StateGraph` with explicit nodes (`agent`, `tools`) and conditional edges
- The ReAct loop: model → tool calls → tool results → model (repeat until done)
- `get_weather` and `convert_temperature` tools
- All conversation history persisted to DialogueDB between turns
- **Invocation 1**: Multi-tool queries and follow-ups — all persisted
- **Invocation 2**: Cold resume from a new process with full context

### Running as separate processes

```bash
# Terminal 1
npm run agent:1

# Terminal 2
DIALOGUE_ID=<id-from-above> npm run agent:2
```

### Graph structure

```
START → agent → (has tool calls?) → tools → agent  (loop)
             → (no tool calls)   → END
```

The `shouldContinue` function inspects the model's response: if it contains tool calls, route to the `tools` node; otherwise, end the graph. This is the core LangGraph pattern — visible, debuggable control flow.

## Why LangGraph + DialogueDB?

LangGraph handles agent orchestration — the graph defines *how* the agent thinks. DialogueDB handles conversation persistence — it stores *what* the agent discussed. The separation means:

- **Restart the process** — the graph is rebuilt, but DialogueDB loads the full conversation history
- **Switch models** — same conversation, different agent graph
- **Inspect conversations** — query DialogueDB's API to see what any agent discussed
- **Cross-service** — one service runs the agent, another loads the conversation by ID
