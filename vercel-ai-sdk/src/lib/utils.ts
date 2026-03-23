/**
 * Shared utilities for DialogueDB + Vercel AI SDK examples.
 */

import type { CoreMessage } from "ai";
import { setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

/**
 * Validate required environment variables and initialize DialogueDB.
 * Call this once at the top of each example before any SDK usage.
 */
export function initDialogueDB(): void {
  const apiKey = process.env.DIALOGUEDB_API_KEY;
  const endpoint = process.env.DIALOGUEDB_ENDPOINT;

  const missing: string[] = [];
  if (!apiKey) missing.push("DIALOGUEDB_API_KEY");
  if (!endpoint) missing.push("DIALOGUEDB_ENDPOINT");
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill in your keys.`
    );
  }

  setGlobalConfig({ apiKey, endpoint });
}

/**
 * Convert DialogueDB messages to Vercel AI SDK CoreMessage format.
 *
 * - Filters to user/assistant messages only (skips system, tool, etc.)
 * - Converts non-string content to JSON so the AI SDK always gets a string
 */
export function toCoreMessages(dialogue: Dialogue): CoreMessage[] {
  const result: CoreMessage[] = [];
  for (const m of dialogue.messages) {
    if (m.role === "user" || m.role === "assistant") {
      result.push({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content),
      });
    }
  }
  return result;
}
