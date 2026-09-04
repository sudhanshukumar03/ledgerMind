import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service.js';
import { ListTransactionsDto } from './dto/list-transactions.dto.js';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async getTransactions(@Req() req: Request, @Query() query: ListTransactionsDto) {
    const merchantId = (req.user as any)?.merchantId;
    return this.transactionsService.getTransactions(merchantId, query);
  }

  @Get(':id')
  async getTransactionDetails(@Req() req: Request, @Param('id') id: string) {
    const merchantId = (req.user as any)?.merchantId;
    return this.transactionsService.getTransactionDetails(merchantId, id);
  }
}
