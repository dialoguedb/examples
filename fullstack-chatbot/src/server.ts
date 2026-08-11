import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";

const DIALOGUEDB_API_KEY = process.env.DIALOGUEDB_API_KEY;
const DIALOGUEDB_ENDPOINT = process.env.DIALOGUEDB_ENDPOINT;

if (!DIALOGUEDB_API_KEY || !DIALOGUEDB_ENDPOINT) {
  console.error(
    "Missing DIALOGUEDB_API_KEY or DIALOGUEDB_ENDPOINT. See .env.example"
  );
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY. See .env.example");
  process.exit(1);
}

setGlobalConfig({ apiKey: DIALOGUEDB_API_KEY, endpoint: DIALOGUEDB_ENDPOINT });

const openai = new OpenAI();
const db = new DialogueDB();
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You are a helpful assistant. Keep responses concise and friendly.";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

// POST /api/chat — send a message, get an AI response
// The full loop: receive → store → load history → call LLM → store response → return
app.post("/api/chat", async (req, res) => {
  try {
    const { dialogueId, userId, message } = req.body;

    if (typeof userId !== "string" || typeof message !== "string") {
      res
        .status(400)
        .json({ error: "userId (string) and message (string) are required" });
      return;
    }

    let dialogue;

    if (typeof dialogueId === "string") {
      dialogue = await db.getDialogue(dialogueId);
      if (!dialogue) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      await dialogue.loadMessages({ order: "asc" });
    } else {
      // Tag the dialogue with the userId for multi-user isolation
      dialogue = await db.createDialogue({
        label: `chat-${userId}`,
        tags: [`user:${userId}`],
      });
    }

    // 1. Store the user's message in DialogueDB
    await dialogue.saveMessage({ role: "user", content: message });

    // 2. Build the OpenAI message array from persisted history
    const openaiMessages: Array<OpenAI.ChatCompletionMessageParam> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    for (const m of dialogue.messages) {
      const content =
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content);
      if (m.role === "assistant") {
        openaiMessages.push({ role: "assistant", content });
      } else if (m.role === "user") {
        openaiMessages.push({ role: "user", content });
      }
    }

    // 3. Call OpenAI with full conversation context
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: openaiMessages,
    });

    const reply = completion.choices[0]?.message?.content ?? "";

    // 4. Store the assistant's response with token usage metadata
    await dialogue.saveMessage({
      role: "assistant",
      content: reply,
      metadata: {
        model: MODEL,
        prompt_tokens: completion.usage?.prompt_tokens ?? 0,
        completion_tokens: completion.usage?.completion_tokens ?? 0,
      },
    });

    res.json({ reply, dialogueId: dialogue.id });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});

// GET /api/history/:dialogueId — load conversation history
// Demonstrates DialogueDB persistence: messages survive server restarts
app.get("/api/history/:dialogueId", async (req, res) => {
  try {
    const dialogue = await db.getDialogue(req.params.dialogueId);
    if (!dialogue) {
      res.json({ messages: [] });
      return;
    }

    await dialogue.loadMessages({ order: "asc" });

    res.json({
      messages: dialogue.messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content),
      })),
    });
  } catch (error) {
    console.error("History error:", error);
    res.status(500).json({ error: "Failed to load history" });
  }
});

// GET /api/conversations?userId=xxx — list a user's conversations
// Demonstrates multi-user isolation via DialogueDB tags
app.get("/api/conversations", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (typeof userId !== "string") {
      res.status(400).json({ error: "userId query param is required" });
      return;
    }

    const { items } = await db.listDialogues();
    const userConversations = items.filter((d) =>
      d.tags?.includes(`user:${userId}`)
    );

    res.json({
      conversations: userConversations.map((d) => ({
        id: d.id,
        label: d.label,
      })),
    });
  } catch (error) {
    console.error("List error:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// DELETE /api/conversations/:dialogueId — delete a conversation
app.delete("/api/conversations/:dialogueId", async (req, res) => {
  try {
    await db.deleteDialogue(req.params.dialogueId);
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

app.listen(PORT, () => {
  console.log(`Chatbot running at http://localhost:${PORT}`);
});
