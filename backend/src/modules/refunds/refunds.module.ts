import { Module } from '@nestjs/common';
import { RefundsService } from './refunds.service.js';
import { RefundsController } from './refunds.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Module({
    imports: [PrismaModule],
    controllers: [RefundsController],
    providers: [RefundsService],
    exports: [RefundsService],
})
export class RefundsModule { }
