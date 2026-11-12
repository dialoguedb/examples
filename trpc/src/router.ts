/**
 * DialogueDB + tRPC — Type-Safe Chat Router
 *
 * Defines tRPC procedures for managing AI conversations backed by DialogueDB.
 * Every procedure is fully typed — callers get exact input/output types with
 * zero codegen.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";
import { z } from "zod";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert DialogueDB messages to OpenAI's chat format. */
function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  return dialogue.messages.map((m): OpenAI.ChatCompletionMessageParam => {
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "assistant") return { role: "assistant", content };
    if (m.role === "system") return { role: "system", content };
    return { role: "user", content };
  });
}

/** Call OpenAI with an optional system prompt prepended. */
async function getCompletion(
  messages: OpenAI.ChatCompletionMessageParam[],
  systemPrompt?: string
): Promise<string> {
  const allMessages: OpenAI.ChatCompletionMessageParam[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: allMessages,
  });

  return response.choices[0].message.content ?? "";
}

// ---------------------------------------------------------------------------
// tRPC Router
// ---------------------------------------------------------------------------

const t = initTRPC.create();

export const appRouter = t.router({
  /** Create a new chat. The system prompt is stored in DialogueDB state. */
  create: t.procedure
    .input(
      z.object({
        label: z.string().optional(),
        systemPrompt: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const dialogue = await db.createDialogue({
        label: input.label,
        state: input.systemPrompt
          ? { systemPrompt: input.systemPrompt }
          : undefined,
      });

      return { id: dialogue.id, label: input.label ?? null };
    }),

  /** List all chats. */
  list: t.procedure.query(async () => {
    const { items } = await db.listDialogues();
    return items.map((d) => ({ id: d.id, label: d.label }));
  }),

  /** Get the full message history for a chat. */
  history: t.procedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const dialogue = await db.getDialogue(input.chatId);
      if (!dialogue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
      }

      await dialogue.loadMessages({ order: "asc" });

      return dialogue.messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content),
      }));
    }),

  /** Send a user message and get an AI response. Both are persisted. */
  send: t.procedure
    .input(z.object({ chatId: z.string(), message: z.string() }))
    .mutation(async ({ input }) => {
      const dialogue = await db.getDialogue(input.chatId);
      if (!dialogue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
      }

      // DialogueDB: load full conversation so OpenAI gets complete context
      await dialogue.loadMessages({ order: "asc" });

      // DialogueDB: persist the user message before calling the LLM
      await dialogue.saveMessage({ role: "user", content: input.message });

      // Build messages and call OpenAI
      const { systemPrompt } = dialogue.state;
      const reply = await getCompletion(
        toOpenAIMessages(dialogue),
        typeof systemPrompt === "string" ? systemPrompt : undefined
      );

      // DialogueDB: persist the assistant response — the full exchange now
      // survives server restarts, deployments, and cold starts
      await dialogue.saveMessage({ role: "assistant", content: reply });

      return { role: "assistant", content: reply };
    }),

  /** Delete a chat and all its messages. */
  delete: t.procedure
    .input(z.object({ chatId: z.string() }))
    .mutation(async ({ input }) => {
      await db.deleteDialogue(input.chatId);
      return { deleted: true };
    }),
});

/** Export the router type for end-to-end type inference on the client. */
export type AppRouter = typeof appRouter;

/** Create a server-side caller — same typed API, no HTTP overhead. */
export const createCaller = t.createCallerFactory(appRouter);
