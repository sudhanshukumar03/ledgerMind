import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller.js';
import { ActionsService } from './actions.service.js';
import { PolicyService } from './policy.service.js';
import { RazorpayClient } from '../../integrations/razorpay/razorpay.client.js';

@Module({
  controllers: [ActionsController],
  providers: [ActionsService, PolicyService, RazorpayClient],
  exports: [ActionsService, PolicyService],
})
export class ActionsModule {}
