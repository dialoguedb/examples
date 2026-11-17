import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Dialogue, DialogueDB } from "dialogue-db";
import OpenAI from "openai";

export const MODEL = "gpt-4o-mini";
export const NAMESPACE = "socket-io-demo";

// ---------------------------------------------------------------------------
// Socket.IO event types (shared between server and client)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: string;
  text: string;
}

export interface ServerToClientEvents {
  history: (messages: ChatMessage[]) => void;
  reply: (message: ChatMessage) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  join: (data: { dialogueId: string }, ack: (ok: boolean) => void) => void;
  message: (data: { text: string }) => void;
}

export interface SocketData {
  dialogueId: string | null;
}

// ---------------------------------------------------------------------------
// DialogueDB ↔ OpenAI bridge
// ---------------------------------------------------------------------------

/** Convert DialogueDB messages to the format OpenAI's chat completions expects. */
export function toChatMessages(
  dialogue: Dialogue,
): ChatCompletionMessageParam[] {
  return dialogue.messages.map((m): ChatCompletionMessageParam => {
    const content = String(m.content);
    switch (m.role) {
      case "user":
        return { role: "user", content };
      case "system":
        return { role: "system", content };
      default:
        return { role: "assistant", content };
    }
  });
}

/** Load or create a dialogue with its messages in chronological order. */
export async function loadDialogue(
  db: DialogueDB,
  id: string,
): Promise<Dialogue> {
  const dialogue = await db.getOrCreateDialogue({ id, namespace: NAMESPACE });
  await dialogue.loadMessages({ order: "asc" });
  return dialogue;
}

/** Send a message array to GPT and return the text response. */
export async function chat(
  openai: OpenAI,
  messages: ChatCompletionMessageParam[],
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages,
  });
  return response.choices[0].message.content ?? "";
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
