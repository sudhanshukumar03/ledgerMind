import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class SettlementsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(merchantId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [settlements, total] = await Promise.all([
            this.prisma.settlement.findMany({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.settlement.count({ where: { merchantId } }),
        ]);

        return {
            data: settlements.map(s => ({
                ...s,
                amount: s.amount.toString(),
            })),
            total,
            page,
            limit,
        };
    }

    async findOne(merchantId: string, id: string) {
        const settlement = await this.prisma.settlement.findFirst({
            where: { id, merchantId },
            include: { bankTransactions: true },
        });

        if (!settlement) {
            throw new NotFoundException('Settlement not found');
        }

        return {
            ...settlement,
            amount: settlement.amount.toString(),
            bankTransactions: settlement.bankTransactions.map(bt => ({
                ...bt,
                amount: bt.amount.toString(),
            }))
        };
    }
}
