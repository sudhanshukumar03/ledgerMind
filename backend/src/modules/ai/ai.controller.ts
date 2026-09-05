
import { Controller, Post, Get, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AiService, AI_TOOLS } from './ai.service.js';
import { ChatDto } from './dto/chat.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) { }

  @Post('investigate/:id')
  async investigate(@Param('id') id: string, @Req() req: any) {
    return this.aiService.investigateException(id, req.user.merchantId);
  }

  @Post('chat')
  async chat(@Body() chatDto: ChatDto, @Req() req: any) {
    return this.aiService.chat(chatDto.messages, req.user.merchantId);
  }

  @Get('config')
  getConfig() {
    return {
      model: process.env.AI_MODEL || 'qwen/qwen3.8-27b',
      toolCount: AI_TOOLS.length
    };
  }
}
