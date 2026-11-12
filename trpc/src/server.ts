/**
 * DialogueDB + tRPC — Standalone HTTP Server
 *
 * Serves the chat router over HTTP. Clients get end-to-end type safety
 * via `@trpc/client` or can call procedures with plain HTTP.
 */

import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.js";

const port = parseInt(process.env.PORT ?? "3000");

const server = createHTTPServer({ router: appRouter });

server.listen(port);
console.log(`tRPC chat server running on http://localhost:${port}`);
console.log(`
Procedures (POST for mutations, GET for queries):

  POST /create     — Create a new chat { label?, systemPrompt? }
  GET  /list       — List all chats
  GET  /history    — Get chat messages { chatId }
  POST /send       — Send a message, get AI response { chatId, message }
  POST /delete     — Delete a chat { chatId }
`);
