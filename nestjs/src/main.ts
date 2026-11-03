import "reflect-metadata";
import "dotenv/config";
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
  console.log(`Chat API running on http://localhost:${port}`);
  console.log(`
Endpoints:
  POST   /chats                 — Create a new chat
  GET    /chats                 — List all chats
  GET    /chats/:id/messages    — Get chat history
  POST   /chats/:id/messages    — Send a message, get AI response
  DELETE /chats/:id             — Delete a chat
`);
}

bootstrap();
