import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class RefundsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(merchantId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [refunds, total] = await Promise.all([
            this.prisma.refund.findMany({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.refund.count({ where: { merchantId } })
        ]);

        return {
            data: refunds.map(refund => ({
                ...refund,
                amount: refund.amount.toString(),
            })),
            total,
            page,
            limit,
        };
    }

    async findOne(merchantId: string, id: string) {
        const refund = await this.prisma.refund.findFirst({
            where: { id, merchantId },
            include: { payment: true },
        });

        if (!refund) {
            throw new NotFoundException('Refund not found');
        }

        return {
            ...refund,
            amount: refund.amount.toString(),
            payment: refund.payment ? {
                ...refund.payment,
                amount: refund.payment.amount.toString(),
            } : null
        };
    }
}
