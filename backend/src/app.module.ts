import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { RefundsModule } from './modules/refunds/refunds.module.js';
import { SettlementsModule } from './modules/settlements/settlements.module.js';
import { BankTransactionsModule } from './modules/bank-transactions/bank-transactions.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module.js';
import { ExceptionsModule } from './modules/exceptions/exceptions.module.js';
import { ActionsModule } from './modules/actions/actions.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { WorkersModule } from './workers/index.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';

import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule,
    AuthModule,
    OrdersModule,
    PaymentsModule,
    RefundsModule,
    SettlementsModule,
    BankTransactionsModule,
    WebhooksModule,
    ReconciliationModule,
    ExceptionsModule,
    ActionsModule,
    AuditModule,
    AiModule,
    WorkersModule,
    DashboardModule,
    TransactionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
