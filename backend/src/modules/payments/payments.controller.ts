import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { parsePagination } from '../../common/utils/pagination.js';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Get()
    async findAll(
        @Request() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: string,
        @Query('method') method?: string,
        @Query('search') search?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        const pagination = parsePagination(page, limit);
        return this.paymentsService.findAll(req.user.merchantId, pagination.page, pagination.limit, { status, method, search, from, to });
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.paymentsService.findOne(req.user.merchantId, id);
    }
}
