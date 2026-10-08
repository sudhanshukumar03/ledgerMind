import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ActionsService } from './actions.service.js';
import { PolicyService } from './policy.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { RazorpayClient } from '../../integrations/razorpay/razorpay.client.js';
import { ActionStatus, ActionType, Role } from '@prisma/client';

/**
 * ActionsService tests focus on the SECURITY INVARIANTS of the action engine:
 * merchant isolation, policy enforcement on propose, the ADMIN-only approve
 * gate, the non-VIEWER reject gate, and the "approval required ⇒ do not execute"
 * rule. These lock the guarantees so a refactor can't silently loosen them.
 */
describe('ActionsService (authorization invariants)', () => {
  let service: ActionsService;
  let prisma: any;
  let policy: any;

  const MERCHANT = 'merchant-1';
  const adminUser = { id: 'admin-1', role: Role.ADMIN, merchantId: MERCHANT };
  const financeUser = { id: 'fin-1', role: Role.FINANCE, merchantId: MERCHANT };
  const viewerUser = { id: 'view-1', role: Role.VIEWER, merchantId: MERCHANT };

  beforeEach(async () => {
    policy = { evaluate: jest.fn(() => ({ allowed: true, approvalRequired: true })) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionsService,
        { provide: PolicyService, useValue: policy },
        { provide: RazorpayClient, useValue: { createRefund: jest.fn(), createPaymentLink: jest.fn() } },
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn() },
            exception: { findUnique: jest.fn(), update: jest.fn() },
            action: {
              create: jest.fn((args: any) => Promise.resolve({ id: 'act-1', ...args.data })),
              findUnique: jest.fn(),
              updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
            },
            auditLog: { create: jest.fn(() => Promise.resolve({})) },
            $transaction: jest.fn((cb: any) => cb({ action: { update: jest.fn() }, auditLog: { create: jest.fn() }, exception: { update: jest.fn() } })),
          },
        },
      ],
    }).compile();

    service = module.get(ActionsService);
    prisma = module.get(PrismaService);
  });
  // APPEND_MARKER

  const proposeDto = (over: Record<string, any> = {}) => ({
    exception_id: 'exc-1',
    action_type: ActionType.MARK_REVIEWED,
    parameters: {},
    ...over,
  });

  describe('createAction', () => {
    it('404s when the requesting user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.createAction('ghost', proposeDto() as any)).rejects.toThrow(NotFoundException);
      expect(prisma.action.create).not.toHaveBeenCalled();
    });

    it('404s when the exception does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(financeUser);
      prisma.exception.findUnique.mockResolvedValue(null);
      await expect(service.createAction(financeUser.id, proposeDto() as any)).rejects.toThrow(NotFoundException);
    });

    it('forbids acting on another merchant\'s exception (tenant isolation)', async () => {
      prisma.user.findUnique.mockResolvedValue(financeUser);
      prisma.exception.findUnique.mockResolvedValue({ id: 'exc-1', merchantId: 'OTHER-merchant' });
      await expect(service.createAction(financeUser.id, proposeDto() as any)).rejects.toThrow(ForbiddenException);
      expect(policy.evaluate).not.toHaveBeenCalled();
      expect(prisma.action.create).not.toHaveBeenCalled();
    });

    it('forbids when policy denies, and creates nothing', async () => {
      prisma.user.findUnique.mockResolvedValue(viewerUser);
      prisma.exception.findUnique.mockResolvedValue({ id: 'exc-1', merchantId: MERCHANT });
      policy.evaluate.mockReturnValue({ allowed: false, approvalRequired: false, reason: 'Viewer cannot request refunds' });
      await expect(service.createAction(viewerUser.id, proposeDto() as any)).rejects.toThrow(/denied by policy/i);
      expect(prisma.action.create).not.toHaveBeenCalled();
    });

    it('when approval is required: persists PENDING_APPROVAL and does NOT execute', async () => {
      prisma.user.findUnique.mockResolvedValue(financeUser);
      prisma.exception.findUnique.mockResolvedValue({ id: 'exc-1', merchantId: MERCHANT });
      policy.evaluate.mockReturnValue({ allowed: true, approvalRequired: true });
      const execSpy = jest.spyOn(service, 'executeAction').mockResolvedValue(undefined as any);

      const action = await service.createAction(financeUser.id, proposeDto() as any);

      expect(prisma.action.create).toHaveBeenCalledTimes(1);
      expect(action.status).toBe(ActionStatus.PENDING_APPROVAL);
      expect(prisma.auditLog.create).toHaveBeenCalled(); // ACTION_PROPOSED logged
      expect(execSpy).not.toHaveBeenCalled();
    });

    it('when auto-approved: persists APPROVED and executes immediately', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.exception.findUnique.mockResolvedValue({ id: 'exc-1', merchantId: MERCHANT });
      policy.evaluate.mockReturnValue({ allowed: true, approvalRequired: false });
      const execSpy = jest.spyOn(service, 'executeAction').mockResolvedValue(undefined as any);

      const action = await service.createAction(adminUser.id, proposeDto() as any);

      expect(action.status).toBe(ActionStatus.APPROVED);
      expect(execSpy).toHaveBeenCalledWith('act-1', MERCHANT, adminUser.id);
    });
  });

  describe('approveAction (ADMIN-only gate)', () => {
    const pending = { id: 'act-1', merchantId: MERCHANT, status: ActionStatus.PENDING_APPROVAL };

    it('forbids a FINANCE user from approving, and mutates nothing', async () => {
      prisma.action.findUnique.mockResolvedValue(pending);
      prisma.user.findUnique.mockResolvedValue(financeUser);
      await expect(
        service.approveAction('act-1', financeUser.id, MERCHANT, { reason: 'ok' } as any),
      ).rejects.toThrow(/only admin/i);
      expect(prisma.action.updateMany).not.toHaveBeenCalled();
    });

    it('forbids a VIEWER from approving', async () => {
      prisma.action.findUnique.mockResolvedValue(pending);
      prisma.user.findUnique.mockResolvedValue(viewerUser);
      await expect(
        service.approveAction('act-1', viewerUser.id, MERCHANT, { reason: 'ok' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects approving an action that is not pending', async () => {
      prisma.action.findUnique.mockResolvedValue({ ...pending, status: ActionStatus.APPROVED });
      await expect(
        service.approveAction('act-1', adminUser.id, MERCHANT, { reason: 'ok' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled(); // short-circuits before role check
    });
  });

  describe('rejectAction (non-VIEWER gate)', () => {
    const pending = { id: 'act-1', merchantId: MERCHANT, status: ActionStatus.PENDING_APPROVAL };

    it('forbids a VIEWER from rejecting, and mutates nothing', async () => {
      prisma.action.findUnique.mockResolvedValue(pending);
      prisma.user.findUnique.mockResolvedValue(viewerUser);
      await expect(
        service.rejectAction('act-1', viewerUser.id, MERCHANT, { reason: 'no' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.action.updateMany).not.toHaveBeenCalled();
    });

    it('allows FINANCE to reject a pending action', async () => {
      prisma.action.findUnique
        .mockResolvedValueOnce(pending) // getActionById
        .mockResolvedValueOnce({ ...pending, status: ActionStatus.REJECTED }); // post-update read
      prisma.user.findUnique.mockResolvedValue(financeUser);

      const out = await service.rejectAction('act-1', financeUser.id, MERCHANT, { reason: 'duplicate' } as any);

      expect(prisma.action.updateMany).toHaveBeenCalled();
      expect(out.status).toBe(ActionStatus.REJECTED);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('createAction (refund amount validation)', () => {
    const payment = { id: 'pay-1', merchantId: MERCHANT, amount: BigInt(10000) };
    const exception = { id: 'exc-1', merchantId: MERCHANT, primaryEntityType: 'PAYMENT', primaryEntityId: 'pay-1' };

    it('rejects refund actions with decimal amounts (FUN-001)', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.exception.findUnique.mockResolvedValue(exception);
      prisma.payment = { findUnique: jest.fn(() => Promise.resolve(payment)) };

      await expect(
        service.createAction(adminUser.id, {
          exception_id: 'exc-1',
          action_type: ActionType.REFUND,
          parameters: { payment_id: 'pay-1', amount: 50.25 as any },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects refund actions with malformed non-integer string amounts', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.exception.findUnique.mockResolvedValue(exception);
      prisma.payment = { findUnique: jest.fn(() => Promise.resolve(payment)) };

      await expect(
        service.createAction(adminUser.id, {
          exception_id: 'exc-1',
          action_type: ActionType.REFUND,
          parameters: { payment_id: 'pay-1', amount: 'abc' as any },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid integer paise amounts and creates action', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.exception.findUnique.mockResolvedValue(exception);
      prisma.payment = { findUnique: jest.fn(() => Promise.resolve(payment)) };

      const action = await service.createAction(adminUser.id, {
        exception_id: 'exc-1',
        action_type: ActionType.REFUND,
        parameters: { payment_id: 'pay-1', amount: 5000 },
      });

      expect(action).toBeDefined();
      expect(prisma.action.create).toHaveBeenCalled();
    });
  });
});
