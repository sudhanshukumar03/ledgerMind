import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class BankTransactionsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(merchantId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [bankTransactions, total] = await Promise.all([
            this.prisma.bankTransaction.findMany({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.bankTransaction.count({ where: { merchantId } })
        ]);

        return {
            data: bankTransactions.map(bt => ({
                ...bt,
                amount: bt.amount.toString(),
            })),
            total,
            page,
            limit,
        };
    }

    async findOne(merchantId: string, id: string) {
        const bankTransaction = await this.prisma.bankTransaction.findFirst({
            where: { id, merchantId },
            include: { settlement: true },
        });

        if (!bankTransaction) {
            throw new NotFoundException('BankTransaction not found');
        }

        return {
            ...bankTransaction,
            amount: bankTransaction.amount.toString(),
            settlement: bankTransaction.settlement ? {
                ...bankTransaction.settlement,
                amount: bankTransaction.settlement.amount.toString(),
            } : null
        };
    }
}
