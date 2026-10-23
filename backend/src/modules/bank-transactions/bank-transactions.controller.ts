import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { BankTransactionsService } from './bank-transactions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { parsePagination } from '../../common/utils/pagination.js';

@Controller('bank-transactions')
@UseGuards(JwtAuthGuard)
export class BankTransactionsController {
    constructor(private readonly bankTransactionsService: BankTransactionsService) { }

    @Get()
    async findAll(
        @Request() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const pagination = parsePagination(page, limit);
        return this.bankTransactionsService.findAll(req.user.merchantId, pagination.page, pagination.limit);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.bankTransactionsService.findOne(req.user.merchantId, id);
    }
}
