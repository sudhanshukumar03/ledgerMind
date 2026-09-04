import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
    constructor(private readonly auditService: AuditService) { }

    @Get()
    async findAll(@Request() req: any, @Query('limit') limit?: string) {
        const parsedLimit = limit ? parseInt(limit, 10) : 50;
        return this.auditService.findAll(req.user.merchantId, isNaN(parsedLimit) ? 50 : parsedLimit);
    }
}
