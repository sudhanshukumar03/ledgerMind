
import { Controller, Post, Get, Body, Param, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService, AI_TOOLS } from './ai.service.js';
import { ChatDto } from './dto/chat.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { THROTTLE } from '../../common/throttler/throttler.config.js';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) { }

  @Post('investigate/:id')
  async investigate(@Param('id') id: string, @Req() req: any) {
    return this.aiService.investigateException(id, req.user.merchantId, req.user.userId);
  }

  // Each chat turn drives paid Groq calls — tightly throttled to bound cost
  // (economic denial-of-service) on top of the global per-IP limit.
  @Throttle({ default: THROTTLE.AI_CHAT })
  @Post('chat')
  async chat(@Body() chatDto: ChatDto, @Req() req: any) {
    return this.aiService.chat(chatDto.messages, req.user.merchantId, req.user.userId);
  }

  // Reveals the configured model and tool-surface size, which is useful
  // reconnaissance for shaping a prompt-injection attempt — so it stays behind
  // the controller's JwtAuthGuard. NOT @Public().
  @Get('config')
  getConfig() {
    return {
      model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
      toolCount: AI_TOOLS.length
    };
  }
}
