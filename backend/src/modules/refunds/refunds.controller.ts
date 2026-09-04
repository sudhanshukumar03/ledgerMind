import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { RefundsService } from './refunds.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

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
        return this.refundsService.findAll(
            req.user.merchantId,
            page ? parseInt(page, 10) : 1,
            limit ? parseInt(limit, 10) : 20,
        );
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.refundsService.findOne(req.user.merchantId, id);
    }
}
