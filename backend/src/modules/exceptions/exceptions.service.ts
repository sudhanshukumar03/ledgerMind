import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { QueryExceptionsDto } from './dto/query-exceptions.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class ExceptionsService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(merchantId: string, query: QueryExceptionsDto) {
        const { type, severity, status, page = 1, limit = 10 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.ExceptionWhereInput = { merchantId };
        if (type) where.type = type;
        if (severity) where.severity = severity;
        if (status) where.status = status;

        const [items, total] = await Promise.all([
            this.prisma.exception.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.exception.count({ where })
        ]);

        return {
            data: items.map(this.mapException),
            total,
            page,
            limit,
        };
    }

    async findOne(merchantId: string, id: string) {
        const isFriendlyId = id.startsWith('EXC-');
        
        const exception = await this.prisma.exception.findFirst({
            where: isFriendlyId ? { exceptionId: id, merchantId } : { id, merchantId },
            include: { aiAnalyses: true },
        });

        if (!exception) {
            throw new NotFoundException('Exception not found');
        }

        return this.mapException(exception);
    }

    async getTimeline(merchantId: string, id: string) {
        // verify exception belongs to merchant
        const isFriendlyId = id.startsWith('EXC-');
        
        const exception = await this.prisma.exception.findFirst({
            where: isFriendlyId ? { exceptionId: id, merchantId } : { id, merchantId }
        });

        if (!exception) {
            throw new NotFoundException('Exception not found');
        }

        // According to schema, timeline is ordered by occurredAt to avoid reconciliation batching artifacts
        const events = await this.prisma.exceptionEvent.findMany({
            where: { exceptionId: id },
            orderBy: { occurredAt: 'asc' }
        });

        return events;
    }

    private mapException(exception: any) {
        return {
            ...exception,
            expectedAmount: exception.expectedAmount?.toString() ?? null,
            actualAmount: exception.actualAmount?.toString() ?? null,
            differenceAmount: exception.differenceAmount?.toString() ?? null,
            financialImpact: exception.financialImpact?.toString() ?? '0',
        };
    }
}
