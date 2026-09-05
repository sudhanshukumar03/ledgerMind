import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
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

    @Get()
    @ApiOperation({ summary: 'List exceptions with optional filters' })
    @ApiResponse({ status: 200, description: 'Return a paginated list of exceptions.' })
    async findAll(@Query() query: QueryExceptionsDto, @Request() req: any) {
        return this.exceptionsService.findAll(req.user.merchantId, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get details of a specific exception' })
    @ApiParam({ name: 'id', description: 'Exception UUID' })
    @ApiResponse({ status: 200, description: 'Return the exception details.' })
    @ApiResponse({ status: 404, description: 'Exception not found.' })
    async findOne(@Param('id') id: string, @Request() req: any) {
        return this.exceptionsService.findOne(req.user.merchantId, id);
    }

    @Get(':id/timeline')
    @ApiOperation({ summary: 'Get the audit timeline for an exception' })
    @ApiParam({ name: 'id', description: 'Exception UUID' })
    @ApiResponse({ status: 200, description: 'Return the timeline events for the exception.' })
    async getTimeline(@Param('id') id: string, @Request() req: any) {
        return this.exceptionsService.getTimeline(req.user.merchantId, id);
    }
}
