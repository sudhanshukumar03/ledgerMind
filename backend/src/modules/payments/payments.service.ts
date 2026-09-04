import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class PaymentsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(merchantId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [payments, total] = await Promise.all([
            this.prisma.payment.findMany({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.payment.count({ where: { merchantId } }),
        ]);

        return {
            data: payments.map(payment => ({
                ...payment,
                amount: payment.amount.toString(),
            })),
            total,
            page,
            limit,
        };
    }

    async findOne(merchantId: string, id: string) {
        const payment = await this.prisma.payment.findFirst({
            where: { id, merchantId },
            include: { order: true, refunds: true },
        });

        if (!payment) {
            throw new NotFoundException('Payment not found');
        }

        return {
            ...payment,
            amount: payment.amount.toString(),
            order: payment.order ? {
                ...payment.order,
                amount: payment.order.amount.toString(),
            } : null,
            refunds: payment.refunds.map(refund => ({
                ...refund,
                amount: refund.amount.toString(),
            }))
        };
    }
}
