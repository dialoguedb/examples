/**
 * Demo — Exercises the Express chatbot API end-to-end
 *
 * 1. Starts the Express server in-process
 * 2. Creates two chats in separate namespaces (multi-user isolation)
 * 3. Has multi-turn conversations with GPT
 * 4. Searches across all conversations with semantic search
 * 5. Cleans up
 *
 * Run:  npm run demo
 */

import { app } from "./server.js";

const PORT = 4123;
const BASE = `http://localhost:${PORT}`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  await fetch(`${BASE}${path}`, { method: "DELETE" });
}

interface ChatResponse {
  id: string;
}

interface MessageResponse {
  content: string;
}

interface ChatListItem {
  id: string;
  label: string;
}

interface HistoryItem {
  role: string;
  content: string;
}

async function main() {
  const server = app.listen(PORT);

  try {
    console.log("=== DialogueDB + Express + OpenAI: End-to-End Chatbot Demo ===\n");

    // -- Create two chats in separate namespaces (multi-user isolation) --------
    console.log("--- Creating chats for two users ---\n");

    const chat1 = await post<ChatResponse>("/chats", {
      label: "demo-alice",
      namespace: "user:alice",
      systemPrompt: "You are a concise travel assistant. Keep answers under 3 sentences.",
    });
    console.log(`Alice's chat: ${chat1.id}`);

    const chat2 = await post<ChatResponse>("/chats", {
      label: "demo-bob",
      namespace: "user:bob",
      systemPrompt: "You are a concise cooking assistant. Keep answers under 3 sentences.",
    });
    console.log(`Bob's chat:   ${chat2.id}\n`);

    // -- Alice's conversation about travel ------------------------------------
    console.log("--- Alice asks about travel ---\n");

    const a1 = await post<MessageResponse>(`/chats/${chat1.id}/messages`, {
      message: "I'm planning a two-week trip to Japan in spring. What cities should I visit?",
    });
    console.log("[alice] I'm planning a two-week trip to Japan in spring...");
    console.log(`[assistant] ${a1.content}\n`);

    const a2 = await post<MessageResponse>(`/chats/${chat1.id}/messages`, {
      message: "Great! What's the best way to get between those cities? Is the Japan Rail Pass worth it?",
    });
    console.log("[alice] What's the best way to get between those cities?");
    console.log(`[assistant] ${a2.content}\n`);

    // -- Bob's conversation about cooking -------------------------------------
    console.log("--- Bob asks about cooking ---\n");

    const b1 = await post<MessageResponse>(`/chats/${chat2.id}/messages`, {
      message: "I want to make authentic ramen from scratch. Where do I start with the broth?",
    });
    console.log("[bob] I want to make authentic ramen from scratch...");
    console.log(`[assistant] ${b1.content}\n`);

    // -- List chats per user using namespace ----------------------------------
    console.log("--- Namespace isolation ---\n");

    const aliceChats = await get<ChatListItem[]>("/chats?namespace=user:alice");
    console.log(`Alice's chats: ${aliceChats.length}`);

    const bobChats = await get<ChatListItem[]>("/chats?namespace=user:bob");
    console.log(`Bob's chats:   ${bobChats.length}\n`);

    // -- Load conversation history (proves persistence) -----------------------
    console.log("--- Message history (loaded from DialogueDB) ---\n");

    const history = await get<HistoryItem[]>(`/chats/${chat1.id}/messages`);
    console.log(`Alice's chat has ${history.length} messages:`);
    for (const m of history) {
      console.log(`  [${m.role}] ${m.content.slice(0, 80)}...`);
    }

    // -- Semantic search across all conversations -----------------------------
    console.log("\n--- Semantic search ---\n");

    const results = await get<HistoryItem[]>(
      `/search?q=${encodeURIComponent("train travel between cities")}&limit=3`
    );
    console.log(`Search "train travel between cities" → ${results.length} results:`);
    for (const r of results) {
      console.log(`  [${r.role}] ${r.content.slice(0, 100)}...`);
    }

    // -- Cleanup --------------------------------------------------------------
    console.log("\n--- Cleanup ---\n");
    await del(`/chats/${chat1.id}`);
    await del(`/chats/${chat2.id}`);
    console.log("Deleted both chats. Done!");
  } finally {
    server.close();
  }
}

main().catch(console.error);
