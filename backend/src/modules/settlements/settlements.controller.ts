import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Controller, Post, Body, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { parsePagination } from '../../common/utils/pagination.js';

@Controller('settlements')
@UseGuards(JwtAuthGuard)
export class SettlementsController {
    constructor(private readonly settlementsService: SettlementsService) { }

    @Get()
    async findAll(
        @Request() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: string,
        @Query('search') search?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        const pagination = parsePagination(page, limit);
        return this.settlementsService.findAll(req.user.merchantId, pagination.page, pagination.limit, { status, search, from, to });
    }

    @Post(':id/allocations')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'FINANCE')
    async replaceAllocations(@Param('id') id: string, @Request() req: any, @Body() body: { allocations: unknown[] }) {
        return this.settlementsService.replaceAllocations(req.user.merchantId, req.user.userId, id, body.allocations);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.settlementsService.findOne(req.user.merchantId, id);
    }
}
