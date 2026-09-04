import { Controller, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { ChatDto } from './dto/chat.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('investigate/:id')
  async investigate(@Param('id') id: string, @Req() req: any) {
    return this.aiService.investigateException(id, req.user.merchantId);
  }

  @Post('chat')
  async chat(@Body() chatDto: ChatDto, @Req() req: any) {
    return this.aiService.chat(chatDto.messages, req.user.merchantId);
  }
}
