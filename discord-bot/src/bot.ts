/**
 * Discord bot with per-channel conversation memory via DialogueDB.
 *
 * Each Discord channel gets its own DialogueDB dialogue. When a user mentions
 * the bot, it loads the channel's conversation history, sends it to Claude,
 * and persists the new exchange — so the bot remembers context across restarts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Client, Events, GatewayIntentBits, Message } from "discord.js";
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

const SYSTEM_PROMPT = `You are a helpful assistant in a Discord server. Keep responses concise \
(under 2000 characters for Discord's message limit). Be friendly and remember prior context — \
users expect you to recall what was discussed earlier in the channel.`;

const MAX_HISTORY = 40; // messages to include as context

// ---------------------------------------------------------------------------
// DialogueDB helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a dialogue for a Discord channel.
 * We tag dialogues with the channel ID so we can look them up later.
 */
async function getOrCreateDialogue(channelId: string) {
  // Try loading an existing dialogue for this channel
  const list = await db.listDialogues();
  const existing = list.items.find((d) =>
    d.tags?.includes(`channel:${channelId}`)
  );

  if (existing) {
    const dialogue = await db.getDialogue(existing.id);
    if (dialogue) {
      await dialogue.loadMessages({ order: "asc" });
      return dialogue;
    }
  }

  // First conversation in this channel — create a new dialogue
  return db.createDialogue({
    label: `discord-channel-${channelId}`,
    tags: [`channel:${channelId}`, "discord"],
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

async function handleMention(message: Message) {
  // Strip the bot mention from the message to get the actual query
  const query = message.content
    .replace(/<@!?\d+>/g, "")
    .trim();

  if (!query) {
    await message.reply(
      "Hey! Ask me something and I'll remember our conversation."
    );
    return;
  }

  // Show typing indicator while processing
  if ("sendTyping" in message.channel) {
    await message.channel.sendTyping();
  }

  // Load (or create) the dialogue for this channel
  const dialogue = await getOrCreateDialogue(message.channelId);

  // Persist the user's message with metadata about who sent it
  await dialogue.saveMessage({
    role: "user",
    content: query,
    metadata: {
      discordUser: message.author.username,
      discordUserId: message.author.id,
      timestamp: message.createdTimestamp,
    },
    tags: [`user:${message.author.id}`],
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

  // Reply in Discord
  await message.reply(assistantText);
}

// ---------------------------------------------------------------------------
// Bot setup
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log("Mention me in a channel to chat — I'll remember everything!");
});

client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from bots (including ourselves)
  if (message.author.bot) return;

  // Only respond when mentioned
  if (!message.mentions.has(client.user!)) return;

  try {
    await handleMention(message);
  } catch (error) {
    console.error("Error handling message:", error);
    await message.reply(
      "Sorry, something went wrong. Please try again."
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
