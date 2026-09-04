import { Module } from '@nestjs/common';
import { ExceptionsService } from './exceptions.service.js';
import { ExceptionsController } from './exceptions.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Module({
    imports: [PrismaModule],
    controllers: [ExceptionsController],
    providers: [ExceptionsService],
    exports: [ExceptionsService],
})
export class ExceptionsModule { }
