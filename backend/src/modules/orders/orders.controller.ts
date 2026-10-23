import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { parsePagination } from '../../common/utils/pagination.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Get()
    async findAll(
        @Request() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const pagination = parsePagination(page, limit);
        return this.ordersService.findAll(req.user.merchantId, pagination.page, pagination.limit);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.ordersService.findOne(req.user.merchantId, id);
    }
}
