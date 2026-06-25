/**
 * Standalone tRPC HTTP server.
 *
 * Start with:  npm run server
 * Then call procedures from any tRPC client pointed at http://localhost:3000.
 */

import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { DialogueDB, setGlobalConfig } from "dialogue-db";
import OpenAI from "openai";
import { createRouter } from "./router.js";
import "dotenv/config";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

const router = createRouter(new DialogueDB(), new OpenAI());

const server = createHTTPServer({
  router,
});

server.listen(3000);
console.log("tRPC server listening on http://localhost:3000");

export type { AppRouter } from "./router.js";
