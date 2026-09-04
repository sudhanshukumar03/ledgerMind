import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ExceptionsService } from './exceptions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { QueryExceptionsDto } from './dto/query-exceptions.dto.js';

@Controller('exceptions')
@UseGuards(JwtAuthGuard)
export class ExceptionsController {
    constructor(private readonly exceptionsService: ExceptionsService) { }

    @Get()
    async findAll(@Query() query: QueryExceptionsDto, @Request() req: any) {
        return this.exceptionsService.findAll(req.user.merchantId, query);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.exceptionsService.findOne(req.user.merchantId, id);
    }

    @Get(':id/timeline')
    async getTimeline(@Param('id') id: string, @Request() req: any) {
        return this.exceptionsService.getTimeline(req.user.merchantId, id);
    }
}
