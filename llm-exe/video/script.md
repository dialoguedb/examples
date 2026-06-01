# Your Typed LLM Pipeline Forgets Users. Here's the Fix.
Series: Stateful (flagship) | Target length: 7:00 | Example: examples/llm-exe

## Cold open  [0:00-0:15]
VO:   This is a travel bot built with llm-exe. Typed pipeline, structured JSON output, the works.
      [beat] I'm killing the process.
      [slow down] New process... and it remembers my entire trip, my diet, even the itinerary.
SCREEN: terminal running chatbot; three exchanges visible with intent/sentiment metadata;
        Ctrl+C; relaunch with invocation 2; ask recap question; bot answers correctly
        with Japan, vegetarian, Kyoto; metadata prints alongside.
NOTE: silence on the "it remembers" moment. Let the structured output print fully.

## The pain  [0:15-0:50]
VO:   llm-exe is one of the cleaner ways to build typed LLM pipelines. Prompt templates
      with Handlebars, schema-validated JSON parsers, composable executors. It's good
      engineering. But its state is in-memory. Process restarts, deploy goes out,
      container recycles — your conversation is gone. And not just the chat.
      All that structured metadata you extracted? Intent, sentiment, every field
      your parser pulled out? [emphasis] Also gone.
SCREEN: diagram of the llm-exe pipeline: prompt template → LLM → JSON parser → typed output.
        Then: process crash animation, empty terminal, zeroed state.
NOTE: [emphasis] on "also gone."

## The plan  [0:50-1:15]
VO:   So let's fix it. We're building a travel chatbot where every turn runs through
      an llm-exe executor and every message — plus its structured metadata — persists
      to DialogueDB. Kill the process, come back, everything's still there. Four moves.
SCREEN: show the llm-exe example folder; quick preview of the final output.

## Move 1 — The typed pipeline  [1:15-2:30]
VO:   First, the llm-exe side. We define a response schema with defineSchema:
      response, intent, sentiment — all typed, all required. Then we wire the pipeline:
      createChatPrompt for the template, createParser with that schema for JSON extraction,
      createLlmExecutor to tie it together. One LLM call gives us the conversational
      reply and the structured metadata in one shot.
SCREEN: show the defineSchema call with the three properties. Show the pipeline wiring:
        createChatPrompt(SYSTEM_PROMPT), createParser("json", { schema: responseSchema }),
        createLlmExecutor({ llm, prompt, parser }). Highlight the flow with arrows.
NOTE: [emphasis] on "one LLM call."

## Move 2 — Persist with metadata  [2:30-3:50]
VO:   Here's where DialogueDB comes in. The chatTurn function loads conversation history
      from the dialogue, feeds every past message into the prompt so the LLM always has
      full context, then runs the executor. After that, two saves. The user message is
      straightforward. The assistant message carries the structured metadata — intent
      and sentiment — right alongside the content. That metadata isn't decoration.
      It's stored, it's queryable. You can pull every negative-sentiment message across
      all your conversations later.
SCREEN: show the chatTurn function. Highlight the loop over dialogue.messages feeding
        the prompt. Highlight saveMessage for user. Zoom on saveMessage for assistant
        with metadata: { intent: result.intent, sentiment: result.sentiment }.
NOTE: [emphasis] on "queryable." [beat] after "two saves" to let the viewer read the code.

## Move 3 — The multi-turn conversation  [3:50-5:15]
VO:   Invocation 1 creates a dialogue and runs three travel questions through the pipeline.
      "Planning a 10-day Japan trip in October." "What about vegetarian food in Kyoto?"
      "Give me a 3-day Kyoto itinerary with those food spots." Each turn, the executor
      gets the full history from DialogueDB, so context builds. Watch the metadata
      after each response — intent shifts from question to planning, sentiment stays
      positive. Six messages persisted. Structured data on every one.
SCREEN: terminal running invocation 1. Three Q&A pairs printing with
        [intent: ... | sentiment: ...] after each. Final line: "6 messages persisted."
NOTE: let the terminal output scroll naturally. Don't rush the metadata lines.

## Money shot  [5:15-6:15]
VO:   Now the restart. Brand new process. We load the dialogue by its saved ID,
      pull all six messages back in order, and ask: "Quick recap — what trip am I
      planning, what dietary restriction, what city itinerary?"
      [beat] Japan. Vegetarian. Kyoto.
      Every detail, from a process that no longer exists. The verification check
      at the bottom confirms it: context preserved across restart — yes.
SCREEN: invocation 2 terminal output. "Loaded 6 messages from DialogueDB" prints.
        Recap question appears. Bot responds with all three details.
        "Context preserved across restart: YES" prints at the bottom.
NOTE: [beat] before "Japan. Vegetarian. Kyoto." — let the answer land in silence.
      Do not talk over the verification line.

## Pattern + CTA  [6:15-6:50]
VO:   That's the pattern. Build your typed pipeline with whatever framework you want.
      Persist on every turn — content and metadata together. Resume by ID.
      The structured data isn't just for replay. It's analytics you get for free on
      every conversation. Same three moves work with OpenAI, LangChain, Anthropic —
      examples for all of them in the repo. Full code is in the description.
      Grab a free API key and you're running in two minutes.
SCREEN: repo end card showing the llm-exe example folder + README.
        dialoguedb.com signup page. Thumbnails of related Stateful episodes.

---
## Shorts derived from this episode
1. "Your typed LLM pipeline forgets everything on restart." -> cold open + money shot, 45s.
2. "Extract intent and sentiment from every LLM call — and keep them." -> Move 1 + Move 2, 40s.
3. "Resume a typed LLM conversation in a brand new process." -> Move 3 + money shot, 50s.
