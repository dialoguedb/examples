/**
 * tRPC router with DialogueDB-backed chat procedures.
 *
 * Every procedure validates inputs with Zod and returns typed results —
 * clients get full type inference with zero codegen.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { DialogueDB, Dialogue } from "dialogue-db";
import type OpenAI from "openai";

const t = initTRPC.create();

const MODEL = "gpt-4o-mini";

function toOpenAIMessages(
  dialogue: Dialogue,
  systemPrompt?: string
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    result.push({ role: "system", content: systemPrompt });
  }

  for (const m of dialogue.messages) {
    const content =
      typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (m.role === "user") {
      result.push({ role: "user", content });
    } else if (m.role === "assistant") {
      result.push({ role: "assistant", content });
    } else if (m.role === "system") {
      result.push({ role: "system", content });
    }
  }

  return result;
}

export function createRouter(db: DialogueDB, openai: OpenAI) {
  return t.router({
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
        return { id: dialogue.id, label: dialogue.label };
      }),

    send: t.procedure
      .input(
        z.object({
          dialogueId: z.string(),
          message: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const dialogue = await db.getDialogue(input.dialogueId);
        if (!dialogue) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Dialogue not found",
          });
        }

        await dialogue.saveMessage({ role: "user", content: input.message });
        await dialogue.loadMessages({ order: "asc" });

        const rawPrompt = dialogue.state.systemPrompt;
        const systemPrompt =
          typeof rawPrompt === "string" ? rawPrompt : undefined;

        const completion = await openai.chat.completions.create({
          model: MODEL,
          max_tokens: 1024,
          messages: toOpenAIMessages(dialogue, systemPrompt),
        });

        const reply = completion.choices[0].message.content ?? "";
        await dialogue.saveMessage({ role: "assistant", content: reply });

        return { reply };
      }),

    history: t.procedure
      .input(z.object({ dialogueId: z.string() }))
      .query(async ({ input }) => {
        const dialogue = await db.getDialogue(input.dialogueId);
        if (!dialogue) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Dialogue not found",
          });
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

    search: t.procedure
      .input(
        z.object({
          query: z.string(),
          limit: z.number().default(5),
        })
      )
      .query(async ({ input }) => {
        const results = await db.searchMessages(input.query, {
          limit: input.limit,
        });
        return results.map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        }));
      }),

    remove: t.procedure
      .input(z.object({ dialogueId: z.string() }))
      .mutation(async ({ input }) => {
        await db.deleteDialogue(input.dialogueId);
        return { deleted: true };
      }),
  });
}

export type AppRouter = ReturnType<typeof createRouter>;
