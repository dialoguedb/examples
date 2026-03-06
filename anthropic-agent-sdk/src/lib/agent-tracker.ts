/**
 * DialogueAgentTracker — Drop-in replacement for the Research Agent's SubagentTracker
 *
 * The research-agent demo logs subagent activity to local JSONL files
 * in logs/session_YYYYMMDD/. Lost when the process ends. No cross-session querying.
 *
 * This class replaces JSONL with DialogueDB threaded dialogues:
 *   - Parent dialogue = main session
 *   - Each subagent = threaded child dialogue (via threadOf)
 *   - Tool calls = messages with structured metadata
 */

import { DialogueDB } from "dialogue-db";
import type { Dialogue, Message } from "dialogue-db";

export class DialogueAgentTracker {
  private db = new DialogueDB();
  private session: Dialogue | null = null;
  private subagents = new Map<string, Dialogue>();

  /** Create the parent session dialogue. */
  async createSession(label?: string): Promise<Dialogue> {
    this.session = await this.db.createDialogue({
      label: label ?? `agent-session-${Date.now()}`,
      tags: ["agent-session"],
    });
    return this.session;
  }

  /** Get the parent session dialogue. */
  getSession(): Dialogue {
    if (!this.session) throw new Error("No session created");
    return this.session;
  }

  /** Register a subagent — creates a threaded child dialogue. */
  async registerSubagent(
    agentId: string,
    agentType: string
  ): Promise<Dialogue> {
    if (!this.session) throw new Error("No session created");

    const child = await this.session.createThread({
      label: agentId,
      state: { agentId, agentType, startedAt: new Date().toISOString() },
      tags: ["subagent", agentType],
    });
    this.subagents.set(agentId, child);

    await this.session.saveMessage({
      role: "system",
      content: `Subagent spawned: ${agentId} (${agentType})`,
      metadata: { agentId, agentType, event: "subagent_start" },
    });

    return child;
  }

  /** Log a tool call to the specified subagent's dialogue (or session if no subagent). */
  async logToolCall(
    agentId: string,
    toolName: string,
    input: Record<string, unknown>,
    output: string
  ): Promise<void> {
    const target = this.subagents.get(agentId) ?? this.session;
    if (!target) throw new Error("No session or subagent");

    await target.saveMessage({
      role: "system",
      content: { tool: toolName, input, output },
      metadata: {
        event: "tool_call",
        toolName,
        agentId,
        timestamp: new Date().toISOString(),
      },
      tags: ["tool-call", toolName],
    });
  }

  /** Mark a subagent as complete. */
  async completeSubagent(agentId: string, summary?: string): Promise<void> {
    const child = this.subagents.get(agentId);
    if (!child) return;

    if (summary) {
      await child.saveMessage({ role: "system", content: summary });
    }
    await child.saveState({ completedAt: new Date().toISOString() });
    await child.end();

    if (this.session) {
      await this.session.saveMessage({
        role: "system",
        content: `Subagent completed: ${agentId}`,
        metadata: { agentId, event: "subagent_stop" },
      });
    }
  }

  /** Load a subagent's full message history. */
  async getSubagentHistory(agentId: string): Promise<readonly Message[]> {
    const child = this.subagents.get(agentId);
    if (!child) throw new Error(`Subagent ${agentId} not found`);
    await child.loadMessages({ order: "asc" });
    return child.messages;
  }

  /** Get all subagent dialogues from the session. */
  async getAllSubagents(): Promise<Dialogue[]> {
    if (!this.session) throw new Error("No session created");
    return this.session.getThreads();
  }

  /** Create per-subagent PostToolUse hooks for an Agent SDK query. */
  createSubagentHooks(agentId: string) {
    return {
      PostToolUse: [
        {
          hooks: [
            async (input: Record<string, unknown>) => {
              await this.logToolCall(
                agentId,
                input.tool_name as string,
                (input.tool_input as Record<string, unknown>) ?? {},
                typeof input.tool_response === "string"
                  ? input.tool_response
                  : JSON.stringify(input.tool_response)
              );
              return { continue: true };
            },
          ],
        },
      ],
    };
  }

  /** Delete the session and all subagent dialogues. */
  async cleanup(): Promise<void> {
    if (!this.session) return;
    const threads = await this.session.getThreads();
    for (const thread of threads) {
      await this.db.deleteDialogue(thread.id);
    }
    await this.db.deleteDialogue(this.session.id);
  }
}
