import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class PaymentsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(
        merchantId: string,
        page = 1,
        limit = 20,
        filters: { status?: string; method?: string; search?: string; from?: string; to?: string } = {},
    ) {
        const skip = (page - 1) * limit;

        // Build a merchant-isolated WHERE clause with optional filters.
        const where: Prisma.PaymentWhereInput = { merchantId };
        if (filters.status && filters.status in PaymentStatus) {
            where.status = filters.status as PaymentStatus;
        }
        if (filters.method) where.method = filters.method;
        if (filters.search) where.paymentId = { contains: filters.search, mode: 'insensitive' };
        if (filters.from || filters.to) {
            const createdAt: Prisma.DateTimeFilter = {};
            if (filters.from) createdAt.gte = new Date(filters.from);
            if (filters.to) createdAt.lte = new Date(filters.to);
            where.createdAt = createdAt;
        }

        const [payments, total] = await Promise.all([
            this.prisma.payment.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.payment.count({ where }),
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
