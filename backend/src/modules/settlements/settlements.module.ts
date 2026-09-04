import { Module } from '@nestjs/common';
import { SettlementsService } from './settlements.service.js';
import { SettlementsController } from './settlements.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Module({
    imports: [PrismaModule],
    controllers: [SettlementsController],
    providers: [SettlementsService],
    exports: [SettlementsService],
})
export class SettlementsModule { }
