import tmi from "tmi.js";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const TWITCH_BOT_USERNAME = requireEnv("TWITCH_BOT_USERNAME");
const TWITCH_OAUTH_TOKEN = requireEnv("TWITCH_OAUTH_TOKEN");
const TWITCH_CHANNELS = requireEnv("TWITCH_CHANNELS")
  .split(",")
  .map((c) => c.trim());

setGlobalConfig({
  apiKey: requireEnv("DIALOGUEDB_API_KEY"),
  endpoint: requireEnv("DIALOGUEDB_ENDPOINT"),
});

const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
const db = new DialogueDB();

const COMMAND_PREFIX = "!ask";
const MAX_HISTORY = 30;
const MAX_REPLY_LENGTH = 480;
const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a helpful AI assistant in a Twitch chat. \
Keep responses concise — under ${MAX_REPLY_LENGTH} characters since Twitch \
truncates long messages. Be friendly and match the casual energy of Twitch chat. \
Remember prior context from the conversation.`;

// -- DialogueDB helpers ------------------------------------------------------

async function getOrCreateDialogue(channel: string) {
  const normalized = channel.replace(/^#/, "");
  const tag = `twitch-channel:${normalized}`;

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
    label: `twitch-${normalized}`,
    tags: [tag, "twitch"],
  });
}

function toOpenAIMessages(
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

// -- Message handler ---------------------------------------------------------

async function handleCommand(
  channel: string,
  userstate: tmi.ChatUserstate,
  question: string
) {
  const dialogue = await getOrCreateDialogue(channel);

  await dialogue.saveMessage({
    role: "user",
    content: question,
    metadata: {
      twitchUser: userstate["display-name"] ?? userstate.username ?? "unknown",
      twitchUserId: userstate["user-id"] ?? "unknown",
      subscriber: userstate.subscriber ?? false,
    },
    tags: userstate["user-id"] ? [`user:${userstate["user-id"]}`] : [],
  });

  const history = toOpenAIMessages(dialogue.messages);

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
  });

  const assistantText = response.choices[0].message.content ?? "";

  await dialogue.saveMessage({
    role: "assistant",
    content: assistantText,
    metadata: {
      model: response.model,
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
    },
  });

  const reply =
    assistantText.length > MAX_REPLY_LENGTH
      ? assistantText.slice(0, MAX_REPLY_LENGTH - 3) + "..."
      : assistantText;

  const displayName =
    userstate["display-name"] ?? userstate.username ?? "friend";
  await client.say(channel, `@${displayName} ${reply}`);
}

// -- Bot setup ---------------------------------------------------------------

const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: TWITCH_BOT_USERNAME,
    password: TWITCH_OAUTH_TOKEN,
  },
  channels: TWITCH_CHANNELS,
});

client.on("connected", (_address: string, _port: number) => {
  console.log("Connected to Twitch IRC");
  console.log(`Channels: ${TWITCH_CHANNELS.join(", ")}`);
  console.log(`Use "${COMMAND_PREFIX} <question>" in chat to interact.`);
});

client.on("message", (channel, userstate, message, self) => {
  if (self) return;
  if (!message.startsWith(COMMAND_PREFIX)) return;

  const question = message.slice(COMMAND_PREFIX.length).trim();
  if (!question) return;

  handleCommand(channel, userstate, question).catch((error) => {
    console.error("Error handling message:", error);
    const displayName =
      userstate["display-name"] ?? userstate.username ?? "friend";
    client
      .say(channel, `@${displayName} Sorry, something went wrong!`)
      .catch(console.error);
  });
});

client.connect().catch(console.error);
