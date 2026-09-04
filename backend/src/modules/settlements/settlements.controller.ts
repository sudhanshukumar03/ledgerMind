import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('settlements')
@UseGuards(JwtAuthGuard)
export class SettlementsController {
    constructor(private readonly settlementsService: SettlementsService) { }

    @Get()
    async findAll(
        @Request() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.settlementsService.findAll(
            req.user.merchantId,
            page ? parseInt(page, 10) : 1,
            limit ? parseInt(limit, 10) : 20,
        );
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.settlementsService.findOne(req.user.merchantId, id);
    }
}
