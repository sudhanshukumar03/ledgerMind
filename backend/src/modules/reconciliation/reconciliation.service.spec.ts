import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ReconciliationService } from './reconciliation.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ExceptionType, Severity, ImpactLevel, MatchEntityType, MatchMethod } from '@prisma/client';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((cb: any) => cb(prisma)),
            order: { findMany: jest.fn(() => Promise.resolve([])) },
            payment: { findMany: jest.fn(() => Promise.resolve([])) },
            refund: { findMany: jest.fn(() => Promise.resolve([])) },
            settlement: { findMany: jest.fn(() => Promise.resolve([])) },
            bankTransaction: { findMany: jest.fn(() => Promise.resolve([])) },
            reconciliationRun: { create: jest.fn(() => Promise.resolve({ id: 'run-1' })), update: jest.fn() },
            reconciliationMatch: { upsert: jest.fn() },
            exception: {
              findUnique: jest.fn(() => Promise.resolve(null)),
              create: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
              groupBy: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get(ReconciliationService);
    prisma = module.get(PrismaService);
  });

  describe('severity scoring (verified formula from source)', () => {
    it('classifies LOW when score < 50', async () => {
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000) } // diff: 10Rs
      ]);
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', amount: BigInt(2000) }
      ]);
      // diffInRupees = 10, Customer Impact HIGH = 3
      // score: (0.5 * 10) + (20 * 3) + 0 + 5 = 5 + 60 + 5 = 70 (Wait, 70 >= 50 is MEDIUM)
      // We want < 50. Let's make diff = 0, and use a rule that gives LOW customer impact, e.g. REFUND_DELAY
      
      prisma.order.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([]);
      
      const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
      prisma.refund.findMany.mockResolvedValue([
        { id: 'r1', status: 'PROCESSING', amount: BigInt(1000), createdAt: twoDaysAgo }
      ]);
      // REFUND_DELAY gives LOW (1). diffInRupees=0, age is 0 for NEW exception, occurrence=1
      // Score = 0 + (20 * 1) + 0 + (5 * 1) = 25 (LOW)

      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: Severity.LOW,
            severityScore: 25,
          }),
        })
      );
    });

    it('classifies MEDIUM at score >= 50', async () => {
      // Order Payment mismatch. diff=0 but we mock customer impact HIGH (3)
      // Actually ORDER_PAYMENT_MISMATCH gives HIGH (3) -> 60. Plus 5 for occurrence = 65.
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000), createdAt: new Date() }
      ]);
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', amount: BigInt(1000), createdAt: new Date() }
      ]);
      // Wait, if amounts match, no mismatch.
      
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000), createdAt: new Date() }
      ]);
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', amount: BigInt(2000), createdAt: new Date() }
      ]);
      // diff = 10Rs -> 0.5 * 10 = 5. Impact HIGH = 3 -> 60. Age = 0. Occur = 1 -> 5.
      // Score = 5 + 60 + 0 + 5 = 70 (MEDIUM)

      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: Severity.MEDIUM,
            severityScore: 70,
          }),
        })
      );
    });

    it('classifies HIGH at score >= 100', async () => {
      // diff = 70Rs (7000 paise). 0.5 * 70 = 35. Impact HIGH = 60. Occur = 5. Total = 100.
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000), createdAt: new Date() }
      ]);
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', amount: BigInt(8000), createdAt: new Date() }
      ]);
      // diff = 7000 paise -> 70 Rs. Score = 35 (diff) + 60 (impact) + 0 + 5 = 100 (HIGH)

      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: Severity.HIGH,
            severityScore: 100,
          }),
        })
      );
    });

    it('classifies CRITICAL at score >= 200', async () => {
      // diff = 270Rs (27000 paise). 0.5 * 270 = 135. Impact = 60. Occur = 5. Total = 200.
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000), createdAt: new Date() }
      ]);
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', amount: BigInt(28000), createdAt: new Date() }
      ]);
      // Score = 135 + 60 + 0 + 5 = 200 (CRITICAL)

      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: Severity.CRITICAL,
            severityScore: 200,
          }),
        })
      );
    });

    it('increases score with occurrenceCount on repeat exceptions (existing dedupKey)', async () => {
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000), createdAt: new Date() }
      ]);
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', amount: BigInt(28000), createdAt: new Date() }
      ]);

      // Mock finding an existing exception
      const now = new Date();
      prisma.exception.findUnique.mockResolvedValue({
        id: 'existing-id',
        createdAt: now,
        occurrenceCount: 2, // will become 3 -> score += 15
      });

      // Score = 135 + 60 + 0 + 15 = 210
      await service.runReconciliation({ merchantId: 'm1' });
      
      expect(prisma.exception.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severityScore: 210,
            occurrenceCount: 3,
          }),
        })
      );
    });

    it('increases score with age when exception already existed (createdAt in past)', async () => {
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000), createdAt: new Date() }
      ]);
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', status: 'PAID', amount: BigInt(2000), createdAt: new Date() }
      ]);

      const tenHoursAgo = new Date(Date.now() - 10 * 3600 * 1000);
      prisma.exception.findUnique.mockResolvedValue({
        id: 'existing-id',
        createdAt: tenHoursAgo,
        occurrenceCount: 1, // becomes 2 -> 10
      });

      // diff = 10Rs -> 5. Impact = 60. Age = 10hrs -> 5. Occur = 2 -> 10. Total = 80.
      await service.runReconciliation({ merchantId: 'm1' });
      
      expect(prisma.exception.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severityScore: 80, // Note: slight precision issues might exist with Date.now, but Math.round is used
          }),
        })
      );
    });
  });

  describe('exception type generation (real types from source)', () => {
    it('creates PAYMENT_MISSING when an order has no matching payment', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1', status: 'PAID', amount: BigInt(1000) }]);
      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: ExceptionType.PAYMENT_MISSING })
      }));
    });

    it('creates DUPLICATE_PAYMENT when one order has two payments', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1', status: 'PAID', amount: BigInt(1000) }]);
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000) },
        { id: 'p2', orderId: 'o1', status: 'CAPTURED', amount: BigInt(1000) },
      ]);
      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: ExceptionType.DUPLICATE_PAYMENT })
      }));
    });

    it('creates ORDER_PAYMENT_MISMATCH when payment amount != order amount', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1', status: 'PAID', amount: BigInt(1000) }]);
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', orderId: 'o1', status: 'CAPTURED', amount: BigInt(2000) },
      ]);
      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: ExceptionType.ORDER_PAYMENT_MISMATCH })
      }));
    });

    it('creates SETTLEMENT_MISSING when a captured payment has no settlement', async () => {
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', status: 'CAPTURED', amount: BigInt(1000), createdAt: new Date() }
      ]);
      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: ExceptionType.SETTLEMENT_MISSING })
      }));
    });

    it('creates BANK_MISMATCH when settlement has no matching bank transaction', async () => {
      prisma.settlement.findMany.mockResolvedValue([
        { id: 's1', utr: 'UTR1', amount: BigInt(1000), createdAt: new Date() }
      ]);
      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: ExceptionType.BANK_MISMATCH })
      }));
    });

    it('creates SETTLEMENT_AMOUNT_MISMATCH when settlement amount != bank tx amount', async () => {
      const now = new Date();
      prisma.settlement.findMany.mockResolvedValue([
        { id: 's1', utr: 'UTR1', amount: BigInt(1000), createdAt: now }
      ]);
      prisma.bankTransaction.findMany.mockResolvedValue([
        { id: 'b1', utr: 'UTR1', amount: BigInt(900), transactionDate: now }
      ]);
      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: ExceptionType.SETTLEMENT_AMOUNT_MISMATCH })
      }));
    });

    it('creates REFUND_DELAY when a refund exceeds the expected window', async () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
      prisma.refund.findMany.mockResolvedValue([
        { id: 'r1', status: 'PROCESSING', amount: BigInt(1000), createdAt: twoDaysAgo }
      ]);
      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: ExceptionType.REFUND_DELAY })
      }));
    });

    it('creates BANK_PAYMENT_MISMATCH (ExceptionType enum) for the bank/payment gateway mismatch case', async () => {
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', status: 'FAILED', amount: BigInt(1000) }
      ]);
      prisma.bankTransaction.findMany.mockResolvedValue([
        { id: 'b1', transactionType: 'CREDIT', amount: BigInt(1000), settlementId: null }
      ]);
      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: ExceptionType.BANK_PAYMENT_MISMATCH })
      }));
    });
  });

  describe('exception ID format', () => {
    it('generates IDs matching EXC-{yyyymmddhhmmss}-{3-digit counter}, not a fixed code', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1', status: 'PAID', amount: BigInt(1000) }]);
      await service.runReconciliation({ merchantId: 'm1' });
      
      const createArgs = prisma.exception.create.mock.calls[0][0];
      expect(createArgs.data.exceptionId).toMatch(/^EXC-\d{14}-\d{3}$/);
    });
  });

  describe('edge cases', () => {
    it('handles zero exceptions/totals without NaN in match rate calc', async () => {
      prisma.payment.aggregate = jest.fn(() => Promise.resolve({ _sum: { amount: null } }));
      prisma.payment.count = jest.fn(() => Promise.resolve(0));
      prisma.exception.count = jest.fn(() => Promise.resolve(0));
      prisma.exception.groupBy = jest.fn(() => Promise.resolve([]));
      prisma.action = { count: jest.fn(() => Promise.resolve(0)) };
      prisma.reconciliationMatch.count = jest.fn(() => Promise.resolve(0));

      const stats = await service.getStats('m1');
      expect(stats.reconciliation_rate).toBe(0);
      expect(stats.total_transaction_volume).toBe('0');
    });

    it('does not double-create an exception for the same dedupKey (upsert semantics)', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1', status: 'PAID', amount: BigInt(1000) }]);
      prisma.exception.findUnique.mockResolvedValue({
        id: 'existing',
        createdAt: new Date(),
        occurrenceCount: 1,
      });

      await service.runReconciliation({ merchantId: 'm1' });
      expect(prisma.exception.create).not.toHaveBeenCalled();
      expect(prisma.exception.update).toHaveBeenCalled();
    });
  });
});
