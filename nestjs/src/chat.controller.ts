import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { ChatService } from "./chat.service.js";

@Controller("chats")
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chatService: ChatService
  ) {}

  @Post()
  @HttpCode(201)
  create(@Body() body: { label?: string; systemPrompt?: string }) {
    return this.chatService.createChat(body.label, body.systemPrompt);
  }

  @Get()
  list() {
    return this.chatService.listChats();
  }

  @Get(":id/messages")
  async getMessages(@Param("id") id: string) {
    const messages = await this.chatService.getMessages(id);
    if (!messages) {
      throw new HttpException("Chat not found", HttpStatus.NOT_FOUND);
    }
    return messages;
  }

  @Post(":id/messages")
  async sendMessage(
    @Param("id") id: string,
    @Body() body: { message: string }
  ) {
    if (!body.message) {
      throw new HttpException("message is required", HttpStatus.BAD_REQUEST);
    }
    const reply = await this.chatService.sendMessage(id, body.message);
    if (!reply) {
      throw new HttpException("Chat not found", HttpStatus.NOT_FOUND);
    }
    return reply;
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.chatService.deleteChat(id);
    return { deleted: true };
  }
}
