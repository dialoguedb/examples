/**
 * Twilio SMS Chatbot with DialogueDB
 *
 * A webhook server that receives incoming SMS via Twilio, generates AI
 * responses with OpenAI, and persists every conversation in DialogueDB.
 * Each phone number gets its own dialogue — the assistant remembers
 * context across texts, even days apart.
 */
import express from "express";
import type { Request, Response } from "express";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const db = new DialogueDB();
const openai = new OpenAI();

const SYSTEM_PROMPT =
  "You are a helpful SMS assistant. Keep responses concise — they are sent as text messages. Aim for under 320 characters when possible.";

const MAX_HISTORY = 20;

// ---------------------------------------------------------------------------
// DialogueDB helpers
// ---------------------------------------------------------------------------

/**
 * Look up a dialogue by phone number tag, or create one for first-time texters.
 */
async function getOrCreateDialogue(phoneNumber: string) {
  const list = await db.listDialogues();
  const existing = list.items.find((d) =>
    d.tags?.includes(`phone:${phoneNumber}`)
  );

  if (existing) {
    const dialogue = await db.getDialogue(existing.id);
    if (dialogue) {
      await dialogue.loadMessages({ order: "asc" });
      return dialogue;
    }
  }

  return db.createDialogue({
    label: `sms-${phoneNumber}`,
    tags: [`phone:${phoneNumber}`, "twilio-sms"],
  });
}

/** Convert DialogueDB messages to OpenAI chat format. */
function toOpenAIMessages(
  messages: readonly { role: string; content: unknown }[]
): OpenAI.ChatCompletionMessageParam[] {
  const recent = messages.slice(-MAX_HISTORY);
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...recent.map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content),
    })),
  ];
}

// ---------------------------------------------------------------------------
// TwiML response helper
// ---------------------------------------------------------------------------

/** Build a TwiML XML response that Twilio reads back as an SMS. */
function twimlResponse(message: string): string {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

// ---------------------------------------------------------------------------
// Webhook server
// ---------------------------------------------------------------------------

const app = express();
app.use(express.urlencoded({ extended: false }));

/**
 * Twilio POSTs here when someone texts your number.
 * The body contains From (phone number) and Body (message text).
 */
app.post("/sms", async (req: Request, res: Response) => {
  const from: string = req.body.From;
  const messageBody: string = req.body.Body;

  if (!from || !messageBody) {
    res.status(400).type("text/xml").send(twimlResponse("Missing required fields."));
    return;
  }

  try {
    // Load (or create) the conversation for this phone number
    const dialogue = await getOrCreateDialogue(from);

    // Persist the incoming SMS
    await dialogue.saveMessage({
      role: "user",
      content: messageBody,
      metadata: { phoneNumber: from },
      tags: [`phone:${from}`],
    });

    // Generate a response with conversation history as context
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 256,
      messages: toOpenAIMessages(dialogue.messages),
    });

    const reply =
      completion.choices[0].message.content ??
      "Sorry, I couldn't generate a response.";

    // Persist the AI response
    await dialogue.saveMessage({
      role: "assistant",
      content: reply,
      metadata: { model: "gpt-4o-mini" },
    });

    res.type("text/xml").send(twimlResponse(reply));
  } catch (error) {
    console.error("Error handling SMS:", error);
    res
      .type("text/xml")
      .send(twimlResponse("Sorry, something went wrong. Please try again."));
  }
});

const PORT = parseInt(process.env.PORT ?? "3000");
app.listen(PORT, () => {
  console.log(`SMS webhook server running on http://localhost:${PORT}`);
  console.log(
    "Configure your Twilio number to POST incoming messages to /sms"
  );
});
