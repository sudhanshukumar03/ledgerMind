import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class OrdersService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(merchantId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.order.count({ where: { merchantId } })
        ]);

        // Convert BigInt to string to avoid JSON serialization errors
        return {
            data: orders.map(order => ({
                ...order,
                amount: order.amount.toString(),
            })),
            total,
            page,
            limit,
        };
    }

    async findOne(merchantId: string, id: string) {
        const order = await this.prisma.order.findFirst({
            where: { id, merchantId },
            include: { payments: true },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        // Convert BigInt to string for both order and related payments
        return {
            ...order,
            amount: order.amount.toString(),
            payments: order.payments.map(payment => ({
                ...payment,
                amount: payment.amount.toString(),
            }))
        };
    }
}
