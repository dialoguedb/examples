/**
 * ChatController — REST endpoints for the chat service.
 *
 * NestJS injects the ChatService automatically. All conversation
 * data flows through DialogueDB — no in-memory state to lose.
 */

import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ChatService } from "./chat.service.js";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  create(@Body() body: { systemPrompt?: string }) {
    return this.chatService.createChat(body.systemPrompt);
  }

  @Post(":id/messages")
  sendMessage(@Param("id") id: string, @Body() body: { message: string }) {
    return this.chatService.sendMessage(id, body.message);
  }

  @Get(":id/messages")
  getMessages(@Param("id") id: string) {
    return this.chatService.getMessages(id);
  }

  @Delete(":id")
  deleteChat(@Param("id") id: string) {
    return this.chatService.deleteChat(id);
  }
}
