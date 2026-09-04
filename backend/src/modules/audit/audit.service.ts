import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class AuditService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(merchantId: string, limit: number = 50) {
        return this.prisma.auditLog.findMany({
            where: { merchantId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: { user: { select: { id: true, name: true, email: true } } }
        });
    }
}
