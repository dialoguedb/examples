import "dotenv/config";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { DialogueDB } from "dialogue-db";

import { toStoredMessages, loadUIMessages } from "./persist";

/**
 * DialogueDB + Vercel AI SDK: persistent useChat, end to end.
 *
 * This runs the exact server-side flow a Next.js Route Handler would, then
 * reloads the conversation cold and continues it, proving that useChat message
 * history survives a restart when it lives in DialogueDB.
 */

const dialogueDbApiKey = process.env.DIALOGUE_DB_API_KEY;
if (!dialogueDbApiKey) {
  throw new Error(
    "Missing DIALOGUE_DB_API_KEY. Copy .env.example to .env and add your key.",
  );
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.",
  );
}

const db = new DialogueDB({ apiKey: dialogueDbApiKey });
const NAMESPACE = "user_demo";
const model = openai("gpt-4o-mini");

/** One chat turn, exactly as the route handler does it. */
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

  // 2. Run the model on the full history. convertToModelMessages is async in v7.
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
  const dialogueId = `vercel-ai-sdk-demo-${Date.now()}`;
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
  console.log("Reloaded from DialogueDB (ready to hand to useChat):");
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
    "\nCleaned up. The conversation round-tripped as UI messages across a cold reload.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
