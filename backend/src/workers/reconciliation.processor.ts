import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ReconciliationService } from '../modules/reconciliation/reconciliation.service.js';
import { Injectable, Logger } from '@nestjs/common';

@Processor('reconciliation')
@Injectable()
export class ReconciliationProcessor extends WorkerHost {
    private readonly logger = new Logger(ReconciliationProcessor.name);

    constructor(
        private readonly reconciliationService: ReconciliationService
    ) {
        super();
    }

    async process(job: Job<{ merchantId: string, dateFrom?: string, dateTo?: string }, any, string>): Promise<any> {
        const { merchantId, dateFrom, dateTo } = job.data;
        this.logger.log(`Processing async reconciliation job for merchant ${merchantId}`);
        
        // The reconciliation engine internally handles idempotency using dedupKeys for exceptions
        const result = await this.reconciliationService.runReconciliation({ merchantId, dateFrom, dateTo });
        
        this.logger.log(`Reconciliation completed for ${merchantId}: ${JSON.stringify(result)}`);
        return result;
    }
}
