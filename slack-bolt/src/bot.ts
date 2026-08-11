/**
 * Slack bot with per-channel conversation memory via DialogueDB.
 *
 * Each Slack channel gets its own DialogueDB dialogue. When a user mentions
 * the bot or sends a DM, it loads the channel's conversation history, sends
 * it to Claude, and persists the new exchange — so the bot remembers context
 * across restarts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { App, LogLevel } from "@slack/bolt";
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

const SYSTEM_PROMPT = `You are a helpful assistant in a Slack workspace. Keep responses concise \
and use Slack-friendly formatting (bold with *text*, code with \`backticks\`, \
bulleted lists with •). Be friendly and remember prior context — users expect \
you to recall what was discussed earlier in the channel.`;

const MAX_HISTORY = 40; // messages to include as context

// ---------------------------------------------------------------------------
// DialogueDB helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a dialogue for a Slack channel.
 * We tag dialogues with the channel ID so we can look them up later.
 */
async function getOrCreateDialogue(channelId: string) {
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

  return db.createDialogue({
    label: `slack-channel-${channelId}`,
    tags: [`channel:${channelId}`, "slack"],
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
// Slack app setup
// ---------------------------------------------------------------------------

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// ---------------------------------------------------------------------------
// Event: app_mention — respond when @mentioned in a channel
// ---------------------------------------------------------------------------

app.event("app_mention", async ({ event, say }) => {
  // Strip the bot mention to get the actual query
  const query = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!query) {
    await say({
      text: "Hey! Ask me something and I'll remember our conversation.",
      thread_ts: event.ts,
    });
    return;
  }

  try {
    const reply = await handleQuery(event.channel, query, event.user);
    await say({ text: reply, thread_ts: event.ts });
  } catch (error) {
    console.error("Error handling app_mention:", error);
    await say({
      text: "Sorry, something went wrong. Please try again.",
      thread_ts: event.ts,
    });
  }
});

// ---------------------------------------------------------------------------
// Event: message — respond to direct messages
// ---------------------------------------------------------------------------

app.event("message", async ({ event, say }) => {
  // Only handle DMs (channel type "im"), skip bot messages and subtypes
  if (event.channel_type !== "im") return;
  if ("bot_id" in event) return;
  if (event.subtype) return;

  const query = event.text?.trim();
  if (!query) return;

  try {
    const reply = await handleQuery(event.channel, query, event.user);
    await say(reply);
  } catch (error) {
    console.error("Error handling DM:", error);
    await say("Sorry, something went wrong. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// Core: handle a query against a channel's conversation history
// ---------------------------------------------------------------------------

async function handleQuery(
  channelId: string,
  query: string,
  userId: string | undefined
): Promise<string> {
  // Load (or create) the dialogue for this channel
  const dialogue = await getOrCreateDialogue(channelId);

  // Persist the user's message
  await dialogue.saveMessage({
    role: "user",
    content: query,
    metadata: {
      slackUser: userId ?? "unknown",
      timestamp: Date.now(),
    },
    tags: userId ? [`user:${userId}`] : [],
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

  // Persist Claude's response
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
// Start
// ---------------------------------------------------------------------------

(async () => {
  await app.start();
  console.log("⚡ Slack bot is running in Socket Mode");
  console.log("Mention me in a channel or DM me — I'll remember everything!");
})();
