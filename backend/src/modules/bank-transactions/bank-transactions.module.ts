import { Module } from '@nestjs/common';
import { BankTransactionsService } from './bank-transactions.service.js';
import { BankTransactionsController } from './bank-transactions.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';

@Module({
    imports: [PrismaModule],
    controllers: [BankTransactionsController],
    providers: [BankTransactionsService],
    exports: [BankTransactionsService],
})
export class BankTransactionsModule { }
