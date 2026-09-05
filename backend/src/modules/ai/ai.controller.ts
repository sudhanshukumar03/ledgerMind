import { Controller, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { ChatDto } from './dto/chat.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Public()
  @Post('investigate/:id')
  async investigate(@Param('id') id: string) {
    // using demo merchant ID for testing
    return this.aiService.investigateException(id, '11111111-1111-4111-8111-111111111111');
  }

  @Post('chat')
  async chat(@Body() chatDto: ChatDto, @Req() req: any) {
    return this.aiService.chat(chatDto.messages, req.user.merchantId);
  }
}
