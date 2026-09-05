import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../database/prisma.module.js';
import { ReconciliationModule } from '../modules/reconciliation/reconciliation.module.js';
import { AiModule } from '../modules/ai/ai.module.js';
import { WebhookProcessor } from './webhook.processor.js';
import { ReconciliationProcessor } from './reconciliation.processor.js';
import { AiInvestigationProcessor } from './ai-investigation.processor.js';

@Module({
    imports: [
        PrismaModule,
        ReconciliationModule,
        AiModule,
        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
                password: process.env.REDIS_PASSWORD || undefined,
            },
        }),
        BullModule.registerQueue(
            { name: 'webhooks' },
            { name: 'reconciliation' },
            { name: 'ai-investigation' }
        ),
    ],
    providers: [
        WebhookProcessor,
        ReconciliationProcessor,
        AiInvestigationProcessor,
    ],
    exports: [BullModule]
})
export class WorkersModule {}
