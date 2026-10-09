import { Controller, Get, Param, Query, Request, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ExceptionsService } from './exceptions.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { QueryExceptionsDto } from './dto/query-exceptions.dto.js';

import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('Exceptions')
@ApiBearerAuth()
@Controller('exceptions')
@UseGuards(JwtAuthGuard)
export class ExceptionsController {
    constructor(private readonly exceptionsService: ExceptionsService) { }

    private getMerchantId(req: any): string {
        const merchantId = req.user?.merchantId;
        if (!merchantId) {
            throw new UnauthorizedException('Merchant context missing from authenticated request');
        }
        return merchantId;
    }

    @Get()
    @ApiOperation({ summary: 'List exceptions with optional filters' })
    @ApiResponse({ status: 200, description: 'Return a paginated list of exceptions.' })
    async findAll(@Query() query: QueryExceptionsDto, @Request() req: any) {
        return this.exceptionsService.findAll(this.getMerchantId(req), query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get details of a specific exception' })
    @ApiParam({ name: 'id', description: 'Exception UUID' })
    @ApiResponse({ status: 200, description: 'Return the exception details.' })
    @ApiResponse({ status: 404, description: 'Exception not found.' })
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.exceptionsService.findOne(this.getMerchantId(req), id);
    }

    @Get(':id/timeline')
    @ApiOperation({ summary: 'Get the audit timeline for an exception' })
    @ApiParam({ name: 'id', description: 'Exception UUID' })
    @ApiResponse({ status: 200, description: 'Return the timeline events for the exception.' })
    async getTimeline(@Param('id') id: string, @Request() req: any) {
        return this.exceptionsService.getTimeline(this.getMerchantId(req), id);
    }
}
