/**
 * DialogueDB + NestJS — Chat API Server
 *
 * Bootstraps a NestJS application with a chat module that persists
 * AI conversations to DialogueDB via dependency-injected services.
 */

import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { setGlobalConfig } from "dialogue-db";
import { AppModule } from "./app.module.js";

setGlobalConfig({
  apiKey: process.env.DIALOGUEDB_API_KEY!,
  endpoint: process.env.DIALOGUEDB_ENDPOINT!,
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = parseInt(process.env.PORT ?? "3000");
  await app.listen(port);
  console.log(`NestJS chat server running on http://localhost:${port}`);
  console.log(`
Endpoints:
  POST   /chat                 — Create a new chat
  POST   /chat/:id/messages    — Send a message, get AI response
  GET    /chat/:id/messages    — Get chat history
  DELETE /chat/:id             — Delete a chat
`);
}

bootstrap();
