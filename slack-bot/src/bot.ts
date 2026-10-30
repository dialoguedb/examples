/**
 * Slack bot with per-channel conversation memory via DialogueDB.
 *
 * Each Slack channel gets its own DialogueDB dialogue. When a user mentions
 * the bot, it loads the channel's conversation history, sends it to Claude,
 * and persists the new exchange — so the bot remembers context across restarts.
 *
 * Uses Socket Mode for easy local development (no public URL required).
 */
import { App, LogLevel } from "@slack/bolt";
import Anthropic from "@anthropic-ai/sdk";
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
and well-formatted using Slack's mrkdwn syntax (*bold*, _italic_, \`code\`, > quotes). \
Remember prior context — users expect you to recall what was discussed earlier in the channel.`;

const MAX_HISTORY = 40;

// ---------------------------------------------------------------------------
// DialogueDB helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a dialogue for a Slack channel.
 * Dialogues are tagged with the channel ID so each channel gets isolated memory.
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
// Slack app
// ---------------------------------------------------------------------------

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// Respond when the bot is @mentioned
app.event("app_mention", async ({ event, say }) => {
  // Strip the bot mention to get the actual query
  const query = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!query) {
    await say({
      text: "Hey! Ask me something and I'll remember our conversation.",
      thread_ts: event.thread_ts ?? event.ts,
    });
    return;
  }

  try {
    // Load (or create) the dialogue for this channel
    const dialogue = await getOrCreateDialogue(event.channel);

    // Persist the user's message with metadata about who sent it
    const userId = event.user ?? "unknown";
    await dialogue.saveMessage({
      role: "user",
      content: query,
      metadata: {
        slackUser: userId,
        timestamp: event.ts,
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

    // Reply in a thread to keep the channel tidy
    await say({
      text: assistantText,
      thread_ts: event.thread_ts ?? event.ts,
    });
  } catch (error) {
    console.error("Error handling mention:", error);
    await say({
      text: "Sorry, something went wrong. Please try again.",
      thread_ts: event.thread_ts ?? event.ts,
    });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

(async () => {
  await app.start();
  console.log("Slack bot is running with Socket Mode");
  console.log("Mention me in a channel to chat — I'll remember everything!");
})();
