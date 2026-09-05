import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
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
    // Register JwtModule at root scope so the global JwtAuthGuard can inject JwtService
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
          throw new Error('JWT_SECRET must be at least 32 characters long. Please set a strong secret in .env');
        }
        return {
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any },
        };
      },
    }),
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
