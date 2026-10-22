"use client";

import { useState } from "react";
import type { FormEvent } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [dialogueId, setDialogueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, dialogueId }),
      });
      const data: { dialogueId: string; content: string; error?: string } =
        await res.json();

      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setDialogueId(data.dialogueId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content },
      ]);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      <h1>DialogueDB + Next.js Chat</h1>
      <p style={{ color: "#666" }}>
        Every message is persisted in DialogueDB via the API route. The
        conversation survives server restarts — no in-memory state needed.
      </p>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          minHeight: 300,
          marginBottom: 16,
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: "#999" }}>Send a message to start chatting.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>
            <strong>{m.role === "user" ? "You" : "AI"}:</strong> {m.content}
          </div>
        ))}
        {loading && <p style={{ color: "#999" }}>Thinking...</p>}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 4,
            border: "1px solid #ddd",
          }}
        />
        <button type="submit" disabled={loading} style={{ padding: "8px 16px" }}>
          Send
        </button>
      </form>

      {dialogueId && (
        <p style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
          Dialogue ID: {dialogueId}
        </p>
      )}
    </main>
  );
}
