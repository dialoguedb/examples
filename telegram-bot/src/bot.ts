/**
 * Telegram bot with per-chat conversation memory via DialogueDB.
 *
 * Each Telegram chat (private or group) gets its own DialogueDB dialogue.
 * When a user sends a message, the bot loads the chat's conversation history,
 * sends it to OpenAI, and persists the new exchange — so the bot remembers
 * context across restarts, deploys, and cold starts.
 */

import OpenAI from "openai";
import { Telegraf } from "telegraf";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const requiredEnvVars = [
  "DIALOGUEDB_API_KEY",
  "DIALOGUEDB_ENDPOINT",
  "TELEGRAM_BOT_TOKEN",
  "OPENAI_API_KEY",
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

const MODEL = process.env.MODEL ?? "gpt-4o-mini";
const MAX_HISTORY = 40; // messages to include as context

const SYSTEM_PROMPT = `You are a helpful assistant in a Telegram chat. Keep responses concise \
and well-formatted for Telegram (use markdown sparingly). Be friendly and remember prior \
context — users expect you to recall what was discussed earlier in the chat.`;

// ---------------------------------------------------------------------------
// DialogueDB helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a dialogue for a Telegram chat.
 * Dialogues are tagged with the chat ID for lookup.
 */
async function getOrCreateDialogue(chatId: number): Promise<Dialogue> {
  const tag = `telegram:${chatId}`;
  const list = await db.listDialogues();
  const existing = list.items.find((d) => d.tags?.includes(tag));

  if (existing) {
    const dialogue = await db.getDialogue(existing.id);
    if (dialogue) {
      await dialogue.loadMessages({ order: "asc" });
      return dialogue;
    }
  }

  return db.createDialogue({
    label: `telegram-chat-${chatId}`,
    tags: [tag, "telegram"],
    state: { provider: "openai", format: "openai-chat", model: MODEL },
  });
}

/**
 * Convert DialogueDB messages to OpenAI format.
 * Only includes the most recent MAX_HISTORY messages for context window management.
 */
function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  const recent = dialogue.messages.slice(-MAX_HISTORY);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...recent.map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content),
    })),
  ];
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleMessage(chatId: number, username: string, text: string) {
  // Load (or create) the dialogue for this chat
  const dialogue = await getOrCreateDialogue(chatId);

  // Persist the user's message with metadata
  await dialogue.saveMessage({
    role: "user",
    content: text,
    metadata: {
      telegramUser: username,
      telegramChatId: chatId,
    },
    tags: [`user:${username}`],
  });

  // Call OpenAI with the full conversation context
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: toOpenAIMessages(dialogue),
  });

  const assistantText = response.choices[0].message.content ?? "";

  // Persist the assistant's response with token usage metadata
  await dialogue.saveMessage({
    role: "assistant",
    content: assistantText,
    metadata: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      model: response.model,
    },
  });

  return assistantText;
}

// ---------------------------------------------------------------------------
// Bot setup
// ---------------------------------------------------------------------------

// /start command — greet the user
bot.start((ctx) =>
  ctx.reply(
    "Hey! I'm an AI assistant powered by DialogueDB. Send me a message " +
      "and I'll remember our conversation — even after restarts. Try it!"
  )
);

// /clear command — delete the dialogue and start fresh
bot.command("clear", async (ctx) => {
  const tag = `telegram:${ctx.chat.id}`;
  const list = await db.listDialogues();
  const existing = list.items.find((d) => d.tags?.includes(tag));

  if (existing) {
    await db.deleteDialogue(existing.id);
    await ctx.reply("Conversation cleared! Send a message to start fresh.");
  } else {
    await ctx.reply("No conversation to clear.");
  }
});

// Handle all text messages
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // Skip commands (already handled above)
  if (text.startsWith("/")) return;

  try {
    // Send "typing" indicator while processing
    await ctx.sendChatAction("typing");

    const reply = await handleMessage(
      ctx.chat.id,
      ctx.from.username ?? ctx.from.first_name,
      text
    );

    await ctx.reply(reply);
  } catch (error) {
    console.error("Error handling message:", error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// Launch the bot
bot.launch().then(() => {
  console.log("Telegram bot is running! Send it a message.");
  console.log("Press Ctrl+C to stop.");
});
