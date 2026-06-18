export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>DialogueDB + Next.js</h1>
      <p>AI chat API with persistent conversation history.</p>

      <h2>Endpoints</h2>
      <pre
        style={{
          background: "#f4f4f4",
          padding: "1rem",
          borderRadius: 8,
          fontSize: 14,
          lineHeight: 1.6,
          overflowX: "auto",
        }}
      >{`POST   /api/chat              Create a new chat
GET    /api/chat              List all chats
POST   /api/chat/:id/messages Send a message, get AI response
GET    /api/chat/:id/messages Get message history
DELETE /api/chat/:id          Delete a chat`}</pre>

      <h2>Quick test</h2>
      <pre
        style={{
          background: "#f4f4f4",
          padding: "1rem",
          borderRadius: 8,
          fontSize: 14,
          lineHeight: 1.6,
          overflowX: "auto",
        }}
      >{`# Create a chat
curl -s -X POST http://localhost:3000/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{"label": "demo"}'

# Send a message (replace CHAT_ID)
curl -s -X POST http://localhost:3000/api/chat/CHAT_ID/messages \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What is DialogueDB?"}'`}</pre>
    </main>
  );
}
