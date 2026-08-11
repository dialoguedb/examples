/**
 * Slack Bot with DialogueDB — Per-channel AI conversations that survive restarts.
 *
 * Each Slack channel gets its own DialogueDB dialogue. When a user mentions the
 * bot or sends a DM, it loads the channel's full history from DialogueDB, sends
 * it to Claude, and persists the new exchange.
 *
 * Uses Slack's Socket Mode so you don't need a public URL.
 */

import Anthropic from "@anthropic-ai/sdk";
import { App } from "@slack/bolt";
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

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
});

const SYSTEM_PROMPT = `You are a helpful assistant in a Slack workspace. Keep responses concise \
and well-formatted using Slack's mrkdwn syntax (*bold*, _italic_, \`code\`). \
Remember prior context — users expect you to recall what was discussed earlier in the channel.`;

const MAX_HISTORY = 40; // messages to include as context

// ---------------------------------------------------------------------------
// DialogueDB helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a dialogue for a Slack channel.
 * Dialogues are tagged with the channel ID for easy lookup.
 */
async function getOrCreateDialogue(channelId: string) {
  const list = await db.listDialogues();
  const existing = list.items.find((d) =>
    d.tags?.includes(`slack-channel:${channelId}`)
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
    tags: [`slack-channel:${channelId}`, "slack"],
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
// Event handlers
// ---------------------------------------------------------------------------

/** Handle an app_mention event (someone @-mentioned the bot in a channel). */
app.event("app_mention", async ({ event, say }) => {
  // Strip the bot mention to get the actual query
  const query = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!query) {
    await say({ text: "Hey! Ask me something — I'll remember our conversation.", thread_ts: event.ts });
    return;
  }

  try {
    const reply = await respond(event.channel, query, event.user ?? "unknown", event.ts);
    await say({ text: reply, thread_ts: event.ts });
  } catch (error) {
    console.error("Error handling mention:", error);
    await say({ text: "Sorry, something went wrong. Please try again.", thread_ts: event.ts });
  }
});

/** Handle direct messages to the bot. */
app.event("message", async ({ event, say }) => {
  // Only handle DMs (channel type "im") that aren't from bots
  if (event.channel_type !== "im") return;
  if ("bot_id" in event) return;
  if (!("text" in event) || !event.text || !event.ts) return;

  try {
    const reply = await respond(event.channel, event.text, event.user ?? "unknown", event.ts);
    await say({ text: reply });
  } catch (error) {
    console.error("Error handling DM:", error);
    await say({ text: "Sorry, something went wrong. Please try again." });
  }
});

/**
 * Core handler: persist the user message, call Claude with full history,
 * persist Claude's reply, and return the response text.
 */
async function respond(
  channelId: string,
  query: string,
  userId: string,
  messageTs: string
): Promise<string> {
  const dialogue = await getOrCreateDialogue(channelId);

  // Persist the user's message with Slack metadata
  await dialogue.saveMessage({
    role: "user",
    content: query,
    metadata: {
      slackUser: userId,
      slackTs: messageTs,
    },
    tags: [`user:${userId}`],
  });

  // Send conversation history to Claude
  const history = toAnthropicMessages(dialogue.messages);
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
// Start
// ---------------------------------------------------------------------------

(async () => {
  await app.start();
  console.log("Slack bot is running in Socket Mode!");
  console.log("Mention me in a channel or DM me to chat.");
})();
