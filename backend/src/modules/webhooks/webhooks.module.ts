import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'webhooks' }),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
