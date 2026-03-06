/**
 * Audit Hook — Reusable PostToolUse hook for automatic audit logging
 *
 * The simplest pattern: call createAuditHook(dialogue) and spread the result
 * into your query's hooks option. Every tool call gets persisted to DialogueDB
 * with structured metadata for filtering and search.
 */

import type { Dialogue } from "dialogue-db";

export function createAuditHook(dialogue: Dialogue) {
  return {
    PostToolUse: [
      {
        hooks: [
          async (input: Record<string, unknown>) => {
            const timestamp = new Date().toISOString();
            await dialogue.saveMessage({
              role: "system",
              content: {
                tool: input.tool_name,
                input: input.tool_input,
                output: input.tool_response,
                timestamp,
              },
              metadata: {
                event: "audit",
                toolName: input.tool_name as string,
                timestamp,
                success: true,
              },
              tags: ["audit", input.tool_name as string],
            });
            return { continue: true };
          },
        ],
      },
    ],
    PostToolUseFailure: [
      {
        hooks: [
          async (input: Record<string, unknown>) => {
            const timestamp = new Date().toISOString();
            await dialogue.saveMessage({
              role: "system",
              content: {
                tool: input.tool_name,
                input: input.tool_input,
                error: input.error,
                timestamp,
              },
              metadata: {
                event: "audit",
                toolName: input.tool_name as string,
                timestamp,
                success: false,
              },
              tags: ["audit", "error", input.tool_name as string],
            });
            return { continue: true };
          },
        ],
      },
    ],
  };
}
