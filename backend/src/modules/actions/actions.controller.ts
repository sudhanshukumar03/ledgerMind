import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ActionsService } from './actions.service.js';
import { CreateActionDto } from './dto/create-action.dto.js';
import { ApproveActionDto, RejectActionDto } from './dto/approve-action.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ActionStatus } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('Actions')
@ApiBearerAuth()
@Controller('actions')
@UseGuards(JwtAuthGuard)
export class ActionsController {
    constructor(private readonly actionsService: ActionsService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new action for an exception' })
    @ApiResponse({ status: 201, description: 'Action successfully proposed or executed.' })
    @ApiResponse({ status: 400, description: 'Invalid payload.' })
    @ApiResponse({ status: 403, description: 'Action denied by policy.' })
    @ApiResponse({ status: 404, description: 'User or exception not found.' })
    async createAction(@Request() req: any, @Body() createActionDto: CreateActionDto) {
        return this.actionsService.createAction(req.user.userId, createActionDto);
    }

    @Get()
    @ApiOperation({ summary: 'List actions with optional status filter' })
    @ApiQuery({ name: 'status', enum: ActionStatus, required: false, description: 'Filter by action status' })
    @ApiResponse({ status: 200, description: 'Return a list of actions.' })
    async getActions(@Request() req: any, @Query('status') status?: ActionStatus) {
        return this.actionsService.getActions(req.user.merchantId, status);
    }

    @Post(':id/approve')
    @ApiOperation({ summary: 'Approve a pending action (Admin only)' })
    @ApiParam({ name: 'id', description: 'Action UUID' })
    @ApiResponse({ status: 200, description: 'Action approved and executed successfully.' })
    @ApiResponse({ status: 400, description: 'Action not in pending state or invalid request.' })
    @ApiResponse({ status: 403, description: 'Forbidden (Not Admin).' })
    @ApiResponse({ status: 404, description: 'Action not found.' })
    async approveAction(
        @Param('id') id: string,
        @Request() req: any,
        @Body() approveActionDto: ApproveActionDto,
    ) {
        return this.actionsService.approveAction(id, req.user.userId, req.user.merchantId, approveActionDto);
    }

    @Post(':id/reject')
    @ApiOperation({ summary: 'Reject a pending action' })
    @ApiParam({ name: 'id', description: 'Action UUID' })
    @ApiResponse({ status: 200, description: 'Action rejected.' })
    @ApiResponse({ status: 400, description: 'Action not in pending state.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    @ApiResponse({ status: 404, description: 'Action not found.' })
    async rejectAction(
        @Param('id') id: string,
        @Request() req: any,
        @Body() rejectActionDto: RejectActionDto,
    ) {
        return this.actionsService.rejectAction(id, req.user.userId, req.user.merchantId, rejectActionDto);
    }
}
