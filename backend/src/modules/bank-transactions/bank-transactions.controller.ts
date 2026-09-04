import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { BankTransactionsService } from './bank-transactions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

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
        return this.bankTransactionsService.findAll(
            req.user.merchantId,
            page ? parseInt(page, 10) : 1,
            limit ? parseInt(limit, 10) : 20,
        );
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.bankTransactionsService.findOne(req.user.merchantId, id);
    }
}
