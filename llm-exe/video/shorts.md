# Quick Save — Shorts from "Your Typed LLM Pipeline Forgets Users"
Source: Stateful flagship, llm-exe episode

---

## Short 1: Your typed LLM pipeline forgets everything on restart
Length: 45s | Source: cold open + money shot

### [0:00-0:02] Hook
VO:   Your typed LLM pipeline forgets every user on restart. Watch.
SCREEN: terminal mid-conversation with structured JSON output visible.

### [0:02-0:25] Demo
VO:   Three-turn travel conversation running through an llm-exe executor.
      Structured output on every response — intent, sentiment, the full reply.
      Now I kill the process.
SCREEN: show the three exchanges with metadata printing. Ctrl+C. Terminal clears.

### [0:25-0:40] Result
VO:   New process. Load the dialogue ID from DialogueDB.
      [beat] It remembers the trip, the diet, the itinerary. Six messages,
      structured metadata on all of them, fully intact.
SCREEN: invocation 2 output. "Loaded 6 messages." Recap answer prints.
        "Context preserved: YES."

### [0:40-0:45] CTA card
SCREEN: "Full build on the channel" + repo link overlay.
        Text: github.com/dialoguedb/examples/llm-exe

---

## Short 2: Extract intent and sentiment from every LLM call — and keep them
Length: 40s | Source: Move 1 + Move 2

### [0:00-0:02] Hook
VO:   One LLM call. Response, intent, and sentiment — all typed, all persisted.
SCREEN: show the structured JSON output: { response, intent, sentiment }.

### [0:02-0:25] Demo
VO:   llm-exe's defineSchema sets the shape. A JSON parser validates it.
      The executor runs the pipeline and you get typed structured output.
      Then DialogueDB saves the response as content and the intent and sentiment
      as metadata — queryable across every conversation you've ever had.
SCREEN: show defineSchema call. Show createParser("json", { schema }).
        Show saveMessage with metadata: { intent, sentiment }.
        Zoom on the metadata object.

### [0:25-0:35] Result
VO:   Every message gets structured analytics for free. No second LLM call,
      no post-processing step.
SCREEN: terminal output showing three turns, each with [intent: ... | sentiment: ...].

### [0:35-0:40] CTA card
SCREEN: "Full build on the channel" + repo link overlay.
        Text: github.com/dialoguedb/examples/llm-exe

---

## Short 3: Resume a typed LLM conversation in a brand new process
Length: 50s | Source: Move 3 + money shot

### [0:00-0:02] Hook
VO:   Brand new process. The AI still knows your entire conversation.
SCREEN: fresh terminal, cursor blinking.

### [0:02-0:30] Demo
VO:   This chatbot ran three turns of travel planning through an llm-exe pipeline.
      Process died. We start a new one, load the dialogue by ID from DialogueDB,
      and feed the history back into the prompt template. The executor picks up
      exactly where we left off.
SCREEN: show invocation 2 code: db.getDialogue(id), dialogue.loadMessages(),
        then the history feeding into createChatPrompt. Show the executor running.

### [0:30-0:45] Result
VO:   "Recap my trip." [beat] Japan, vegetarian, Kyoto. Full context, zero local state.
SCREEN: terminal prints the recap question and answer.
        "Context preserved across restart: YES" at the bottom.

### [0:45-0:50] CTA card
SCREEN: "Full build on the channel" + repo link overlay.
        Text: github.com/dialoguedb/examples/llm-exe
