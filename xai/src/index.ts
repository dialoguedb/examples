import "dotenv/config";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { xai } from "@ai-sdk/xai";
import { DialogueDB } from "dialogue-db";

import { toStoredMessages, loadUIMessages } from "./persist";

/**
 * DialogueDB + xAI (Grok): persistent chat, end to end.
 *
 * This runs the exact server-side flow a Route Handler would, then reloads the
 * conversation cold and continues it, proving that chat history survives a
 * restart when it lives in DialogueDB. The persistence layer is identical to
 * the vercel-ai-sdk example: only the model provider changed.
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.XAI_API_KEY) {
  throw new Error(
    "Missing XAI_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const NAMESPACE = "user_demo";
// Override with XAI_MODEL if this id is unavailable to your key; list yours
// with GET https://api.x.ai/v1/language-models.
const model = xai(process.env.XAI_MODEL ?? "grok-4.20-0309-non-reasoning");

/** One chat turn, exactly as a route handler does it. */
async function runTurn(
  dialogueId: string,
  history: UIMessage[],
  userText: string,
): Promise<UIMessage[]> {
  const userMessage: UIMessage = {
    id: `local-${history.length}`,
    role: "user",
    parts: [{ type: "text", text: userText }],
  };
  const incoming = [...history, userMessage];

  const dialogue = await db.getOrCreateDialogue({
    id: dialogueId,
    namespace: NAMESPACE,
  });

  // 1. Persist the incoming user turn.
  await dialogue.saveMessages(toStoredMessages([userMessage]));

  // 2. Run Grok on the full history. convertToModelMessages is async in v7.
  const result = streamText({
    model,
    messages: await convertToModelMessages(incoming),
  });

  // 3. toUIMessageStreamResponse hands the full UI message list to onFinish.
  let finalMessages: UIMessage[] = [];
  const response = result.toUIMessageStreamResponse({
    originalMessages: incoming,
    onFinish: ({ messages }) => {
      finalMessages = messages;
    },
  });
  await response.text(); // drain the stream so onFinish runs

  // 4. Persist the new assistant message(s): everything past the original list.
  await dialogue.saveMessages(
    toStoredMessages(finalMessages.slice(incoming.length)),
  );

  return finalMessages;
}

function line(m: UIMessage): string {
  const text = m.parts
    .map((p) => (p.type === "text" ? p.text : `[${p.type}]`))
    .join(" ")
    .trim();
  return `  ${m.role}: ${text.slice(0, 90)}`;
}

async function main(): Promise<void> {
  const dialogueId = `xai-demo-${Date.now()}`;
  console.log(`Dialogue: ${dialogueId} (namespace: ${NAMESPACE})\n`);

  console.log("Turn 1:");
  const afterTurn1 = await runTurn(
    dialogueId,
    [],
    "In one word, what does DialogueDB store?",
  );
  console.log(afterTurn1.map(line).join("\n"), "\n");

  // Cold reload, as a fresh process or page load would do.
  const reloaded = await loadUIMessages(db, dialogueId, NAMESPACE);
  console.log("Reloaded from DialogueDB (ready to hand back to the UI):");
  console.log(reloaded.map(line).join("\n"), "\n");

  console.log("Turn 2 (continued from the reloaded history):");
  const afterTurn2 = await runTurn(
    dialogueId,
    reloaded,
    "And in one word, why does that matter?",
  );
  console.log(afterTurn2.map(line).join("\n"));

  await db.deleteDialogue(dialogueId, { namespace: NAMESPACE });
  console.log(
    "\nCleaned up. The conversation round-tripped through DialogueDB across a cold reload.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
