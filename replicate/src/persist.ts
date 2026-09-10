import type { Dialogue, DialogueDB } from "dialogue-db";

/**
 * The bridge between DialogueDB and Replicate's prompt-based API.
 *
 * Unlike OpenAI-compatible providers that take a messages array, Replicate
 * models take a plain prompt string and a system_prompt. This module converts
 * DialogueDB's structured message history into those two fields.
 *
 * The latest user message becomes the prompt. Prior exchanges are folded into
 * the system_prompt so the model retains conversational context.
 */

export function buildPrompt(dialogue: Dialogue): {
  systemPrompt: string;
  prompt: string;
} {
  const messages = dialogue.messages;
  const latest = messages[messages.length - 1];
  const prompt = String(latest.content);

  const prior = messages.slice(0, -1);
  const systemParts: string[] = ["You are a helpful, concise assistant."];

  const history = prior.filter((m) => m.role !== "system");
  if (history.length > 0) {
    const formatted = history
      .map(
        (m) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${String(m.content)}`,
      )
      .join("\n");
    systemParts.push(`Previous conversation:\n${formatted}`);
  }

  return { systemPrompt: systemParts.join("\n\n"), prompt };
}

export function collectOutput(output: object): string {
  if (!Array.isArray(output)) {
    throw new Error("Unexpected model output: expected array of tokens");
  }
  return output.map(String).join("");
}

export async function loadDialogue(
  db: DialogueDB,
  id: string,
  namespace: string,
): Promise<Dialogue | null> {
  const dialogue = await db.getDialogue(id, { namespace });
  if (!dialogue) return null;
  await dialogue.loadMessages({ order: "asc" });
  return dialogue;
}
