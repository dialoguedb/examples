/**
 * AWS Lambda Chat Handler — DialogueDB + OpenAI
 *
 * A stateless Lambda function that handles AI chat requests.
 * DialogueDB provides conversation memory across invocations —
 * no DynamoDB tables, no ElastiCache, no session management code.
 *
 * Deploy behind API Gateway as a single POST endpoint.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue } from "dialogue-db";

// Clients initialized at module level persist across warm invocations.
// This is a Lambda best practice — avoids re-creating SDK clients on every call.
setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You are a helpful assistant. Be concise (2-3 sentences). " +
  "Remember context from earlier in the conversation.";

function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  return dialogue.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return jsonResponse(400, { error: "Request body is required" });
    }

    const { conversationId, message } = JSON.parse(event.body) as {
      conversationId?: string;
      message?: string;
    };

    if (!message) {
      return jsonResponse(400, { error: '"message" field is required' });
    }

    // DialogueDB: get or create the conversation.
    // First call: no conversationId, so a new dialogue is created.
    // Follow-up calls: client sends the conversationId from the first response.
    const dialogue = conversationId
      ? await db.getOrCreateDialogue({ id: conversationId })
      : await db.createDialogue({
          label: "lambda-chat",
          state: { provider: "openai", model: MODEL },
        });

    // DialogueDB: hydrate the stateless Lambda with conversation history.
    // This loads all previous messages so the LLM has full context.
    await dialogue.loadMessages({ order: "asc" });

    // Persist the user's message before calling the LLM
    await dialogue.saveMessage({ role: "user", content: message });

    // Call OpenAI with the full conversation history
    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...toOpenAIMessages(dialogue),
      ],
    });

    const reply = completion.choices[0].message.content ?? "";

    // Persist the assistant's response for the next invocation
    await dialogue.saveMessage({ role: "assistant", content: reply });

    return jsonResponse(200, {
      conversationId: dialogue.id,
      reply,
    });
  } catch (error) {
    console.error("Handler error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return jsonResponse(500, { error: errorMessage });
  }
}
