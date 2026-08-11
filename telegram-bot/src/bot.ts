/**
 * Telegram bot with per-chat conversation memory via DialogueDB.
 *
 * Each Telegram chat (private or group) gets its own DialogueDB dialogue.
 * When a user sends a message (or mentions the bot in a group), it loads
 * the chat's conversation history, sends it to Claude, and persists the
 * new exchange — so the bot remembers context across restarts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const anthropic = new Anthropic();
const db = new DialogueDB();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

const SYSTEM_PROMPT = `You are a helpful assistant in a Telegram chat. Keep responses concise \
and well-formatted (Telegram supports basic Markdown). Be friendly and remember prior context — \
users expect you to recall what was discussed earlier in the conversation.`;

const MAX_HISTORY = 40; // messages to include as context

// ---------------------------------------------------------------------------
// DialogueDB helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a dialogue for a Telegram chat.
 * We tag dialogues with the chat ID so we can look them up later.
 */
async function getOrCreateDialogue(chatId: number) {
  const tag = `chat:${chatId}`;
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
  });
}

/**
 * Convert DialogueDB messages into Anthropic API format.
 * Only includes the most recent MAX_HISTORY messages for context window management.
 */
function toAnthropicMessages(
  messages: readonly { role: string; content: unknown }[]
): Anthropic.MessageParam[] {
  const recent = messages.slice(-MAX_HISTORY);
  return recent.map((m) => ({
    role: m.role as "user" | "assistant",
    content: String(m.content),
  }));
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleMessage(chatId: number, text: string, username: string, userId: number) {
  // Send "typing" indicator while processing
  await bot.telegram.sendChatAction(chatId, "typing");

  // Load (or create) the dialogue for this chat
  const dialogue = await getOrCreateDialogue(chatId);

  // Persist the user's message with metadata about who sent it
  await dialogue.saveMessage({
    role: "user",
    content: text,
    metadata: {
      telegramUser: username,
      telegramUserId: userId,
      timestamp: Date.now(),
    },
    tags: [`user:${userId}`],
  });

  // Build the message history for Claude
  const history = toAnthropicMessages(dialogue.messages);

  // Call Claude with the full conversation context
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: history,
  });

  const assistantText =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Persist Claude's response with token usage metadata
  await dialogue.saveMessage({
    role: "assistant",
    content: assistantText,
    metadata: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      model: response.model,
    },
  });

  return assistantText;
}

// ---------------------------------------------------------------------------
// Bot setup
// ---------------------------------------------------------------------------

// Handle /start command
bot.start((ctx) =>
  ctx.reply("Hey! Send me a message and I'll remember our conversation.")
);

// Handle text messages
bot.on(message("text"), async (ctx) => {
  const text = ctx.message.text;
  const chatId = ctx.chat.id;
  const chatType = ctx.chat.type;
  const username = ctx.from.username ?? ctx.from.first_name;
  const userId = ctx.from.id;

  // In groups, only respond when mentioned by name or replied to
  if (chatType === "group" || chatType === "supergroup") {
    const botInfo = await bot.telegram.getMe();
    const mentioned = text.includes(`@${botInfo.username}`);
    const replied = ctx.message.reply_to_message?.from?.id === botInfo.id;
    if (!mentioned && !replied) return;
  }

  try {
    const reply = await handleMessage(chatId, text, username, userId);
    await ctx.reply(reply);
  } catch (error) {
    console.error("Error handling message:", error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// Start polling
bot.launch().then(() => {
  console.log("Telegram bot is running!");
  console.log("Send a message in a private chat or mention me in a group.");
});
