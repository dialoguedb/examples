import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

const SYSTEM_PROMPT =
  "You are a helpful assistant in a Telegram chat. Keep responses concise " +
  "and well-formatted for mobile screens. Be friendly and remember prior " +
  "context — users expect you to recall what was discussed earlier.";

const MAX_HISTORY = 40;

// ---------------------------------------------------------------------------
// DialogueDB helpers
// ---------------------------------------------------------------------------

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

function buildOpenAIMessages(
  messages: readonly { role: string; content: unknown }[]
): OpenAI.ChatCompletionMessageParam[] {
  const recent = messages.slice(-MAX_HISTORY);
  const result: OpenAI.ChatCompletionMessageParam[] = [];

  for (const m of recent) {
    if (m.role === "user") {
      result.push({ role: "user", content: String(m.content) });
    } else if (m.role === "assistant") {
      result.push({ role: "assistant", content: String(m.content) });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleMessage(chatId: number, text: string, username: string) {
  const dialogue = await getOrCreateDialogue(chatId);

  await dialogue.saveMessage({
    role: "user",
    content: text,
    metadata: { telegramUser: username, chatId },
    tags: [`user:${username}`],
  });

  const history = buildOpenAIMessages(dialogue.messages);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
  });

  const assistantText = response.choices[0].message.content ?? "";

  await dialogue.saveMessage({
    role: "assistant",
    content: assistantText,
    metadata: {
      model: response.model,
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
    },
  });

  return assistantText;
}

// ---------------------------------------------------------------------------
// Bot commands and listeners
// ---------------------------------------------------------------------------

bot.start((ctx) =>
  ctx.reply(
    "Hi! I'm a chatbot with persistent memory powered by DialogueDB.\n\n" +
      "Send me any message and I'll remember our conversation — " +
      "even after I restart."
  )
);

bot.on(message("text"), async (ctx) => {
  try {
    await ctx.sendChatAction("typing");

    const reply = await handleMessage(
      ctx.chat.id,
      ctx.message.text,
      ctx.message.from.username ?? ctx.message.from.first_name
    );

    await ctx.reply(reply);
  } catch (error) {
    console.error("Error handling message:", error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

bot.launch();
console.log("Telegram bot is running — send it a message!");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
