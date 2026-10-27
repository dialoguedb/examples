import express from "express";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue, Message } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

// -- Helpers ------------------------------------------------------------------

function toOpenAIMessages(dialogue: Dialogue): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  const systemPrompt: unknown = dialogue.state?.systemPrompt;
  if (typeof systemPrompt === "string") {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const m of dialogue.messages) {
    if (typeof m.content === "string" && (m.role === "user" || m.role === "assistant")) {
      messages.push({ role: m.role, content: m.content });
    }
  }
  return messages;
}

async function chat(messages: OpenAI.ChatCompletionMessageParam[]): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages,
  });
  return response.choices[0].message.content ?? "";
}

// -- Express app --------------------------------------------------------------

export const app = express();
app.use(express.json());

// Create a new chat. Optionally scope it to a user with a namespace.
app.post("/chats", async (req, res) => {
  const { label, systemPrompt, namespace } = req.body;
  const dialogue = await db.createDialogue({
    label,
    namespace,
    state: systemPrompt ? { systemPrompt } : undefined,
  });
  res.status(201).json({ id: dialogue.id, label: label ?? null });
});

// List chats, optionally filtered by namespace.
app.get("/chats", async (req, res) => {
  const namespace = typeof req.query.namespace === "string" ? req.query.namespace : undefined;
  const { items } = await db.listDialogues(namespace ? { namespace } : undefined);
  res.json(items.map((d) => ({ id: d.id, label: d.label, namespace: d.namespace })));
});

// Get full message history for a chat.
app.get("/chats/:id/messages", async (req, res) => {
  const dialogue = await db.getDialogue(req.params.id);
  if (!dialogue) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  await dialogue.loadMessages({ order: "asc" });
  res.json(dialogue.messages.map((m) => ({ role: m.role, content: m.content })));
});

// Send a message — the full loop:
// 1. Load conversation history from DialogueDB
// 2. Save the user message
// 3. Send history + new message to OpenAI
// 4. Save the assistant response
// 5. Return the response
app.post("/chats/:id/messages", async (req, res) => {
  const dialogue = await db.getDialogue(req.params.id);
  if (!dialogue) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  const { message } = req.body;
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  await dialogue.loadMessages({ order: "asc" });
  await dialogue.saveMessage({ role: "user", content: message });

  const reply = await chat(toOpenAIMessages(dialogue));
  await dialogue.saveMessage({ role: "assistant", content: reply });

  res.json({ role: "assistant", content: reply });
});

// Semantic search across all stored messages.
// DialogueDB embeds messages automatically — just pass a natural language query.
app.get("/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : undefined;
  if (!query) {
    res.status(400).json({ error: "q query parameter is required" });
    return;
  }
  const limit = Number(req.query.limit) || 5;
  const results: Message[] = await db.searchMessages(query, { limit });
  res.json(
    results.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created: m.created,
    }))
  );
});

// Delete a chat and all its messages.
app.delete("/chats/:id", async (req, res) => {
  await db.deleteDialogue(req.params.id);
  res.json({ deleted: true });
});

// -- Start (only when run directly, not when imported by the demo) ------------

const isDirectRun = process.argv[1]?.endsWith("server.ts");
if (isDirectRun) {
  const PORT = process.env.PORT ?? 3000;
  app.listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT}`);
  });
}
