import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AiService } from '../modules/ai/ai.service.js';
import { Logger } from '@nestjs/common';

@Processor('ai-investigation')
export class AiInvestigationProcessor extends WorkerHost {
  private readonly logger = new Logger(AiInvestigationProcessor.name);

  constructor(private readonly aiService: AiService) {
    super();
  }

  async process(job: Job<{ exceptionId: string; merchantId: string }>): Promise<any> {
    const { exceptionId, merchantId } = job.data;
    this.logger.log(`Processing AI investigation for exception ${exceptionId}`);

    const result = await this.aiService.investigateException(exceptionId, merchantId);

    this.logger.log(`AI investigation completed for ${exceptionId}`);
    return result;
  }
}
