import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SettlementStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class SettlementsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(
        merchantId: string,
        page = 1,
        limit = 20,
        filters: { status?: string; search?: string; from?: string; to?: string } = {},
    ) {
        const skip = (page - 1) * limit;

        // Merchant-isolated WHERE clause with optional filters.
        const where: Prisma.SettlementWhereInput = { merchantId };
        if (filters.status && filters.status in SettlementStatus) {
            where.status = filters.status as SettlementStatus;
        }
        if (filters.search) {
            where.OR = [
                { settlementId: { contains: filters.search, mode: 'insensitive' } },
                { utr: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters.from || filters.to) {
            const settlementDate: Prisma.DateTimeFilter = {};
            if (filters.from) settlementDate.gte = new Date(filters.from);
            if (filters.to) settlementDate.lte = new Date(filters.to);
            where.settlementDate = settlementDate;
        }

        const [settlements, total] = await Promise.all([
            this.prisma.settlement.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.settlement.count({ where }),
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
