/**
 * RAG Pipeline — DialogueDB + OpenAI
 *
 * Uses DialogueDB as both knowledge store and conversation memory:
 * 1. Ingest knowledge articles as messages in a DialogueDB dialogue
 * 2. User asks a question
 * 3. searchMessages finds the most relevant articles by meaning
 * 4. Retrieved context + conversation history → GPT generates an answer
 * 5. Q&A persisted in a separate conversation dialogue
 * 6. Follow-up questions benefit from both retrieval and conversation history
 */

import OpenAI from "openai";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import type { Dialogue, Message } from "dialogue-db";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const openai = new OpenAI();
const db = new DialogueDB();
const MODEL = "gpt-4o-mini";

// ---------------------------------------------------------------------------
// Knowledge Base — articles about a fictional API platform
// ---------------------------------------------------------------------------

const KNOWLEDGE_ARTICLES = [
  `Authentication: NexusAPI uses API keys for authentication. Include your key in the Authorization header as "Bearer <key>". Keys are scoped to a project and can be rotated from the dashboard. Never expose keys in client-side code — use a backend proxy instead.`,

  `Rate Limits: Free-tier accounts are limited to 100 requests per minute and 10,000 per day. Pro accounts get 1,000/min and 100,000/day. If you exceed the limit, the API returns HTTP 429 with a Retry-After header. Implement exponential backoff for production systems.`,

  `Webhooks: Configure webhook endpoints in Settings → Webhooks. NexusAPI sends POST requests with a JSON payload and an X-Nexus-Signature header for verification. Events include: document.created, document.updated, analysis.complete, and quota.warning. Failed deliveries are retried 3 times with exponential backoff.`,

  `Error Codes: Common errors — 400: malformed request body, check JSON syntax. 401: invalid or expired API key. 403: key lacks permission for this endpoint. 404: resource not found. 422: valid JSON but semantic validation failed (e.g., unsupported language). 429: rate limit exceeded. 500: internal error, safe to retry.`,

  `Supported Languages: NexusAPI document analysis supports 47 languages. Tier 1 (best accuracy): English, Spanish, French, German, Japanese, Chinese (Simplified). Tier 2: Portuguese, Italian, Korean, Dutch, Arabic, Hindi. Tier 3: all others. Specify the language code in the "lang" field or set it to "auto" for detection.`,

  `Fine-Tuning: Upload training data as JSONL files with "input" and "expected_output" fields. Minimum 100 examples required, recommended 500+. Fine-tuning jobs run asynchronously — poll the /jobs endpoint or configure a webhook for job.completed. Models are available for inference within 30 minutes of completion.`,

  `Data Privacy: All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Documents are processed in the region specified by your project settings (US, EU, or APAC). Data is automatically deleted 30 days after processing unless you enable long-term storage. SOC 2 Type II and GDPR compliant.`,

  `Billing: Usage is tracked per API call. Document analysis costs $0.002 per page. Fine-tuning costs $0.10 per training example. Storage costs $0.01 per GB per month. View real-time usage in the dashboard under Billing → Usage. Set spending alerts to avoid surprises.`,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract text content from a DialogueDB message. */
function textOf(msg: Message): string {
  return typeof msg.content === "string"
    ? msg.content
    : JSON.stringify(msg.content);
}

/** Semantic search for knowledge relevant to a query, scoped by tag. */
async function retrieve(query: string, limit: number = 3): Promise<Message[]> {
  return db.searchMessages(query, { limit, tags: ["knowledge"] });
}

/** Convert DialogueDB messages to OpenAI chat format. */
function toOpenAIMessages(
  dialogue: Dialogue
): OpenAI.ChatCompletionMessageParam[] {
  return dialogue.messages.map((m): OpenAI.ChatCompletionMessageParam => {
    const content = textOf(m);
    if (m.role === "user") return { role: "user", content };
    return { role: "assistant", content };
  });
}

/** Ask GPT a question grounded in retrieved context. */
async function askWithContext(
  context: string,
  conversation: Dialogue
): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are a helpful support agent for NexusAPI.",
        "Answer the user's question using ONLY the retrieved context below.",
        "If the context doesn't cover the question, say so.",
        "",
        "--- Retrieved Context ---",
        context,
        "--- End Context ---",
      ].join("\n"),
    },
    ...toOpenAIMessages(conversation),
  ];

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages,
  });

  return response.choices[0].message.content ?? "";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== DialogueDB RAG Pipeline ===\n");

  // 1. Create a knowledge-base dialogue and ingest articles
  console.log("Ingesting knowledge base...");
  const knowledgeBase = await db.createDialogue({
    label: "nexusapi-knowledge-base",
    tags: ["knowledge"],
  });

  for (const article of KNOWLEDGE_ARTICLES) {
    await knowledgeBase.saveMessage({ role: "assistant", content: article });
  }
  console.log(
    `Stored ${KNOWLEDGE_ARTICLES.length} articles in dialogue ${knowledgeBase.id}\n`
  );

  // 2. Create a conversation dialogue for the Q&A session
  const conversation = await db.createDialogue({
    label: "rag-conversation",
  });

  // 3. First question — authentication
  const q1 = "How do I authenticate my API requests to NexusAPI?";
  console.log(`User: ${q1}`);
  await conversation.saveMessage({ role: "user", content: q1 });

  const r1 = await retrieve(q1);
  console.log(`  Retrieved ${r1.length} articles:`);
  for (const msg of r1) {
    console.log(`    - ${textOf(msg).slice(0, 70)}...`);
  }

  const a1 = await askWithContext(r1.map(textOf).join("\n\n"), conversation);
  await conversation.saveMessage({ role: "assistant", content: a1 });
  console.log(`Assistant: ${a1}\n`);

  // 4. Follow-up — GPT uses both retrieval AND conversation history
  const q2 = "Can I use the same key for both testing and production?";
  console.log(`User: ${q2}`);
  await conversation.saveMessage({ role: "user", content: q2 });

  const r2 = await retrieve(q2);
  console.log(`  Retrieved ${r2.length} articles:`);
  for (const msg of r2) {
    console.log(`    - ${textOf(msg).slice(0, 70)}...`);
  }

  const a2 = await askWithContext(r2.map(textOf).join("\n\n"), conversation);
  await conversation.saveMessage({ role: "assistant", content: a2 });
  console.log(`Assistant: ${a2}\n`);

  // 5. Different topic — rate limits
  const q3 = "What happens if I exceed my rate limit?";
  console.log(`User: ${q3}`);
  await conversation.saveMessage({ role: "user", content: q3 });

  const r3 = await retrieve(q3);
  console.log(`  Retrieved ${r3.length} articles:`);
  for (const msg of r3) {
    console.log(`    - ${textOf(msg).slice(0, 70)}...`);
  }

  const a3 = await askWithContext(r3.map(textOf).join("\n\n"), conversation);
  await conversation.saveMessage({ role: "assistant", content: a3 });
  console.log(`Assistant: ${a3}\n`);

  // 6. Summary
  console.log("--- Pipeline Summary ---");
  console.log(
    `Knowledge base: ${KNOWLEDGE_ARTICLES.length} articles ingested`
  );
  console.log(
    `Conversation: ${conversation.messages.length} messages (${conversation.messages.length / 2} Q&A exchanges)`
  );
  console.log(
    "Each answer was grounded in semantically retrieved context from DialogueDB."
  );

  // Cleanup
  await db.deleteDialogue(knowledgeBase.id);
  await db.deleteDialogue(conversation.id);
  console.log("\nCleaned up. Done!");
}

main().catch(console.error);
