import { Controller, Post, Get, Body, Request, UseGuards } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service.js';
import { RunReconciliationDto } from './dto/run-reconciliation.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * POST /reconciliation/run
   * merchantId is ALWAYS sourced from the JWT — never from the request body.
   */
  @Post('run')
  run(@Body() dto: RunReconciliationDto, @Request() req: any) {
    return this.reconciliationService.runReconciliation({
      merchantId: req.user.merchantId,
      dateFrom: dto.dateFrom,
      dateTo: dto.dateTo,
    });
  }

  /**
   * GET /reconciliation/runs
   * Returns the 20 most recent runs for the authenticated merchant.
   */
  @Get('runs')
  listRuns(@Request() req: any) {
    return this.reconciliationService.listRuns(req.user.merchantId);
  }

  /**
   * GET /reconciliation/stats
   * Aggregate dashboard stats: volume, match rate, open exceptions, pending actions.
   */
  @Get('stats')
  getStats(@Request() req: any) {
    return this.reconciliationService.getStats(req.user.merchantId);
  }
}
