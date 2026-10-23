import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { RefundsService } from './refunds.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { parsePagination } from '../../common/utils/pagination.js';

@Controller('refunds')
@UseGuards(JwtAuthGuard)
export class RefundsController {
    constructor(private readonly refundsService: RefundsService) { }

    @Get()
    async findAll(
        @Request() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const pagination = parsePagination(page, limit);
        return this.refundsService.findAll(req.user.merchantId, pagination.page, pagination.limit);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.refundsService.findOne(req.user.merchantId, id);
    }
}
