import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ActionsService } from './actions.service.js';
import { CreateActionDto } from './dto/create-action.dto.js';
import { ApproveActionDto, RejectActionDto } from './dto/approve-action.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ActionStatus } from '@prisma/client';

@Controller('actions')
@UseGuards(JwtAuthGuard)
export class ActionsController {
    constructor(private readonly actionsService: ActionsService) { }

    @Post()
    async createAction(@Request() req: any, @Body() createActionDto: CreateActionDto) {
        return this.actionsService.createAction(req.user.userId, createActionDto);
    }

    @Get()
    async getActions(@Request() req: any, @Query('status') status?: ActionStatus) {
        return this.actionsService.getActions(req.user.merchantId, status);
    }

    @Post(':id/approve')
    async approveAction(
        @Param('id') id: string,
        @Request() req: any,
        @Body() approveActionDto: ApproveActionDto,
    ) {
        return this.actionsService.approveAction(id, req.user.userId, req.user.merchantId, approveActionDto);
    }

    @Post(':id/reject')
    async rejectAction(
        @Param('id') id: string,
        @Request() req: any,
        @Body() rejectActionDto: RejectActionDto,
    ) {
        return this.actionsService.rejectAction(id, req.user.userId, req.user.merchantId, rejectActionDto);
    }
}
