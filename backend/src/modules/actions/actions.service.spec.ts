import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { ActionsService } from './actions.service.js';
import { PolicyService } from './policy.service.js';

const merchantId = randomUUID(),
  userId = randomUUID(),
  exceptionId = randomUUID(),
  paymentId = randomUUID(),
  actionId = randomUUID();
function fixture() {
  const user = { id: userId, merchantId, role: 'FINANCE' };
  const exception = {
    id: exceptionId,
    merchantId,
    status: 'OPEN',
    primaryEntityType: 'PAYMENT',
    primaryEntityId: paymentId,
  };
  const payment = {
    id: paymentId,
    merchantId,
    paymentId: 'pay_demo',
    currency: 'INR',
    status: 'CAPTURED',
    capturedAt: new Date(),
    amount: 1000000n,
  };
  let row: any;
  const prisma: any = {
    $queryRaw: jest.fn(async () => []),
    user: {
      findUnique: jest.fn(async () => user),
      findFirst: jest.fn(async () => user),
    },
    exception: {
      findFirstOrThrow: jest.fn(async () => exception),
      findFirst: jest.fn(async () => exception),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    payment: {
      findFirst: jest.fn(async () => payment),
      findUniqueOrThrow: jest.fn(async () => payment),
    },
    refund: {
      findUnique: jest.fn(async () => null),
      aggregate: jest.fn(async () => ({ _sum: { amount: 0n } })),
      upsert: jest.fn(async () => ({})),
    },
    action: {
      aggregate: jest.fn(async () => ({ _sum: { reservedAmount: 0n } })),
      findUnique: jest.fn(async () => row),
      findUniqueOrThrow: jest.fn(async () => row),
      findFirst: jest.fn(async () => row),
      create: jest.fn(
        async ({ data }: any) => (row = { id: actionId, ...data }),
      ),
      update: jest.fn(async ({ data }: any) => (row = { ...row, ...data })),
      updateMany: jest.fn(async ({ data }: any) => {
        row = { ...row, ...data };
        return { count: 1 };
      }),
    },
    actionApproval: { create: jest.fn(async () => ({})) },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const gateway = {
    createRefund: jest.fn(async (_: any, amount: any) => ({
      id: 'rfnd_mock',
      payment_id: 'pay_demo',
      currency: 'INR',
      amount,
      status: 'pending',
    })),
    createPaymentLink: jest.fn(),
  };
  const service = new ActionsService(
    prisma,
    new PolicyService(),
    gateway as any,
  );
  const dto = {
    exception_id: exceptionId,
    action_type: 'REFUND' as const,
    parameters: { payment_id: paymentId, amount: 100000 },
  };
  return {
    service,
    prisma,
    gateway,
    user,
    payment,
    exception,
    dto,
    setRow: (value: any) => (row = { executionProtocol: 'v2', ...value }),
    row: () => row,
  };
}

describe('ActionsService financial authorization and uncertainty', () => {
  it.each(['RESOLVED', 'IGNORED'])(
    'does not claim an unsubmitted refund for a %s parent',
    async (status) => {
      const f = fixture();
      f.exception.status = status;
      f.setRow({
        id: actionId,
        merchantId,
        exceptionId,
        status: 'APPROVED',
        actionType: 'REFUND',
        parameters: f.dto.parameters,
      });
      await f.service.executeAction(actionId, merchantId);
      expect(f.row().status).toBe('FAILED');
      expect(f.row().failureReason).toMatch(/no longer active/);
      expect(f.row().externalSubmittedAt).toBeFalsy();
      expect(f.gateway.createRefund).not.toHaveBeenCalled();
    },
  );
  it.each(['RESOLVED', 'IGNORED'])(
    'rechecks a %s decision committed after the execution claim',
    async (status) => {
      const f = fixture();
      f.setRow({
        id: actionId,
        merchantId,
        exceptionId,
        status: 'APPROVED',
        actionType: 'REFUND',
        parameters: f.dto.parameters,
      });
      f.prisma.$transaction.mockImplementation(async (fn: any) => {
        const result = await fn(f.prisma);
        if (result?.status === 'EXECUTING') f.exception.status = status;
        return result;
      });
      await expect(
        f.service.executeAction(actionId, merchantId),
      ).rejects.toThrow(/no longer active/);
      expect(f.row().status).toBe('FAILED');
      expect(f.row().externalSubmittedAt).toBeNull();
      expect(f.gateway.createRefund).not.toHaveBeenCalled();
    },
  );
  it.each(['cancelled', 'expired'])(
    'records a confirmed %s completed link as inactive without changing its parent',
    async (status) => {
      const f = fixture();
      const action = {
        id: actionId,
        merchantId,
        exceptionId,
        actionType: 'CREATE_PAYMENT_LINK',
        status: 'COMPLETED',
        parameters: { amount: 100 },
        executionResult: { id: 'plink_known' },
        executionClaimToken: null,
      };
      f.setRow(action);
      await (f.service as any).finish(
        action,
        {
          id: 'plink_known',
          amount: 100,
          currency: 'INR',
          reference_id: actionId,
          short_url: 'https://example.invalid/link',
          status,
        },
        userId,
      );
      expect(f.row().status).toBe('FAILED');
      expect(f.row().failureReason).toContain(status);
      expect(f.prisma.exception.updateMany).not.toHaveBeenCalled();
      expect(f.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ACTION_PAYMENT_LINK_INACTIVE',
          }),
        }),
      );
    },
  );
  it('rejects a different provider link when refreshing completed evidence', async () => {
    const f = fixture();
    const action = {
      id: actionId,
      merchantId,
      exceptionId,
      actionType: 'CREATE_PAYMENT_LINK',
      status: 'COMPLETED',
      parameters: { amount: 100 },
      executionResult: { id: 'plink_known' },
      executionClaimToken: null,
    };
    f.setRow(action);
    await expect(
      (f.service as any).finish(
        action,
        {
          id: 'plink_other',
          amount: 100,
          currency: 'INR',
          reference_id: actionId,
          short_url: 'https://example.invalid/link',
          status: 'cancelled',
        },
        userId,
      ),
    ).rejects.toThrow(/identity differs/);
    expect(f.prisma.action.update).not.toHaveBeenCalled();
  });
  it('keeps a confirmed active completed link protective without repeating the parent transition', async () => {
    const f = fixture();
    const action = {
      id: actionId,
      merchantId,
      exceptionId,
      actionType: 'CREATE_PAYMENT_LINK',
      status: 'COMPLETED',
      parameters: { amount: 100 },
      executionResult: { id: 'plink_known' },
      executionClaimToken: null,
    };
    f.setRow(action);
    await (f.service as any).finish(
      action,
      {
        id: 'plink_known',
        amount: 100,
        currency: 'INR',
        reference_id: actionId,
        short_url: 'https://example.invalid/link',
        status: 'created',
      },
      userId,
    );
    expect(f.row().status).toBe('COMPLETED');
    expect(f.prisma.exception.updateMany).not.toHaveBeenCalled();
  });
  it('rejects unknown users', async () => {
    const f = fixture();
    f.prisma.user.findUnique.mockResolvedValue(null);
    await expect(f.service.createAction(userId, f.dto)).rejects.toThrow(
      'User not found',
    );
  });
  it('rejects viewers before writes', async () => {
    const f = fixture();
    f.user.role = 'VIEWER';
    await expect(f.service.createAction(userId, f.dto)).rejects.toThrow();
    expect(f.prisma.action.create).not.toHaveBeenCalled();
  });
  it('scopes exceptions to the authenticated merchant', async () => {
    const f = fixture();
    f.prisma.exception.findFirst.mockResolvedValue(null);
    await expect(f.service.createAction(userId, f.dto)).rejects.toThrow(
      'Exception not found',
    );
    expect(f.prisma.exception.findFirst).toHaveBeenCalledWith({
      where: { id: exceptionId, merchantId },
    });
  });
  it('reserves balance and waits for approval without calling the provider', async () => {
    const f = fixture();
    const action = await f.service.createAction(userId, f.dto);
    expect(action.status).toBe('PENDING_APPROVAL');
    expect(f.row().reservedAmount).toBe(100000n);
    expect(f.gateway.createRefund).not.toHaveBeenCalled();
    expect(f.prisma.auditLog.create).toHaveBeenCalled();
  });
  it.each(['CREATED', 'AUTHORIZED', 'FAILED'])(
    'rejects %s payment refund',
    async (status) => {
      const f = fixture();
      f.payment.status = status;
      await expect(f.service.createAction(userId, f.dto)).rejects.toThrow(
        'captured',
      );
      expect(f.gateway.createRefund).not.toHaveBeenCalled();
    },
  );
  it('rejects cross-currency operations', async () => {
    const f = fixture();
    f.payment.currency = 'USD';
    await expect(f.service.createAction(userId, f.dto)).rejects.toThrow('INR');
  });
  it('rejects an unrelated captured payment', async () => {
    const f = fixture();
    f.exception.primaryEntityId = randomUUID();
    await expect(f.service.createAction(userId, f.dto)).rejects.toThrow(
      'unrelated',
    );
  });
  it('counts pending and uncertain reservations against refundable capacity', async () => {
    const f = fixture();
    f.prisma.action.aggregate.mockResolvedValue({
      _sum: { reservedAmount: 950000n },
    });
    await expect(f.service.createAction(userId, f.dto)).rejects.toThrow(
      'unreserved',
    );
  });
  it('replays a completed action before mutable balance checks', async () => {
    const f = fixture();
    f.setRow({ id: actionId, status: 'COMPLETED', parameters: {} });
    const out = await f.service.createAction(userId, f.dto);
    expect(out.status).toBe('COMPLETED');
    expect(f.prisma.payment.findFirst).not.toHaveBeenCalled();
    expect(f.gateway.createRefund).not.toHaveBeenCalled();
  });
  it('does not call provider when proposal audit fails', async () => {
    const f = fixture();
    f.prisma.auditLog.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(f.service.createAction(userId, f.dto)).rejects.toThrow(
      'audit unavailable',
    );
    expect(f.gateway.createRefund).not.toHaveBeenCalled();
  });
  it('rejects self-approval even by an ADMIN', async () => {
    const f = fixture();
    f.user.role = 'ADMIN';
    f.setRow({
      id: actionId,
      merchantId,
      status: 'PENDING_APPROVAL',
      requestedById: userId,
      approvals: [],
      requiredApprovals: 1,
    });
    await expect(
      f.service.approveAction(actionId, userId, merchantId, {
        reason: 'reviewed',
      }),
    ).rejects.toThrow('own action');
  });
  it('rejects repeated votes', async () => {
    const f = fixture();
    f.user.role = 'ADMIN';
    f.setRow({
      id: actionId,
      merchantId,
      status: 'PENDING_APPROVAL',
      requestedById: randomUUID(),
      approvals: [{ userId }],
      requiredApprovals: 2,
    });
    await expect(
      f.service.approveAction(actionId, userId, merchantId, {
        reason: 'reviewed',
      }),
    ).rejects.toThrow('already voted');
  });
  it('records the first of two approvals without executing', async () => {
    const f = fixture();
    f.user.role = 'ADMIN';
    f.setRow({
      id: actionId,
      merchantId,
      status: 'PENDING_APPROVAL',
      requestedById: randomUUID(),
      approvals: [],
      requiredApprovals: 2,
    });
    expect(
      (
        await f.service.approveAction(actionId, userId, merchantId, {
          reason: 'reviewed',
        })
      ).status,
    ).toBe('PENDING_APPROVAL');
    expect(f.gateway.createRefund).not.toHaveBeenCalled();
  });
  it('allows FINANCE to reject', async () => {
    const f = fixture();
    f.setRow({
      id: actionId,
      merchantId,
      status: 'PENDING_APPROVAL',
      approvals: [],
    });
    expect(
      (
        await f.service.rejectAction(actionId, userId, merchantId, {
          reason: 'wrong amount',
        })
      ).status,
    ).toBe('REJECTED');
  });
  it('keeps an uncertain provider outcome reserved and never resolves the exception', async () => {
    const f = fixture();
    f.setRow({
      id: actionId,
      merchantId,
      status: 'APPROVED',
      exceptionId,
      exception: f.exception,
      actionType: 'REFUND',
      parameters: f.dto.parameters,
    });
    f.gateway.createRefund.mockRejectedValue(new Error('connection lost'));
    await expect(f.service.executeAction(actionId, merchantId)).rejects.toThrow(
      'connection lost',
    );
    expect(f.row().status).toBe('OUTCOME_UNKNOWN');
    expect(f.prisma.exception.update).not.toHaveBeenCalled();
    expect(f.prisma.exception.updateMany).not.toHaveBeenCalled();
  });
  it('does not clear the discrepancy when the provider accepts a refund', async () => {
    const f = fixture();
    f.setRow({
      id: actionId,
      merchantId,
      status: 'APPROVED',
      exceptionId,
      exception: f.exception,
      actionType: 'REFUND',
      parameters: f.dto.parameters,
    });
    await f.service.executeAction(actionId, merchantId);
    expect(f.row().status).toBe('COMPLETED');
    expect(f.prisma.exception.update).not.toHaveBeenCalled();
    expect(f.prisma.exception.updateMany).not.toHaveBeenCalled();
    expect(f.gateway.createRefund).toHaveBeenCalledWith(
      'pay_demo',
      100000,
      actionId,
    );
  });
  it('uses stable canonical idempotency independent of parameter key order', () => {
    const f = fixture();
    expect(
      (f.service as any).buildIdempotencyKey(exceptionId, 'REFUND', {
        amount: 1,
        payment_id: paymentId,
      }),
    ).toBe(
      (f.service as any).buildIdempotencyKey(exceptionId, 'REFUND', {
        payment_id: paymentId,
        amount: 1,
      }),
    );
  });
  it('does not automatically submit a historical intent lacking the new protocol marker', async () => {
    const f = fixture();
    f.setRow({
      id: actionId,
      merchantId,
      status: 'APPROVED',
      executionProtocol: null,
      exception: f.exception,
      actionType: 'REFUND',
      parameters: f.dto.parameters,
    });
    await f.service.executeAction(actionId, merchantId);
    expect(f.gateway.createRefund).not.toHaveBeenCalled();
    expect(f.row().status).toBe('APPROVED');
  });
  it('rejects disabled financial proposals without persisting a reservation', async () => {
    const f = fixture();
    (f.gateway as any).mode = 'disabled';
    await expect(f.service.createAction(userId, f.dto)).rejects.toThrow(
      'disabled',
    );
    expect(f.prisma.action.create).not.toHaveBeenCalled();
  });
  it('fails an unsubmitted approved action when execution was disabled after approval', async () => {
    const f = fixture();
    (f.gateway as any).mode = 'disabled';
    f.setRow({
      id: actionId,
      merchantId,
      status: 'APPROVED',
      exception: f.exception,
      actionType: 'REFUND',
      parameters: f.dto.parameters,
    });
    await f.service.executeAction(actionId, merchantId);
    expect(f.row().status).toBe('FAILED');
    expect(f.row().externalSubmittedAt).toBeUndefined();
    expect(f.gateway.createRefund).not.toHaveBeenCalled();
  });
  it('does not reset a recorded submission on an incorrectly approved row', async () => {
    const f = fixture();
    f.setRow({
      id: actionId,
      merchantId,
      status: 'APPROVED',
      externalSubmittedAt: new Date(),
      exception: f.exception,
      actionType: 'REFUND',
      parameters: f.dto.parameters,
    });
    await f.service.executeAction(actionId, merchantId);
    expect(f.row().status).toBe('OUTCOME_UNKNOWN');
    expect(f.gateway.createRefund).not.toHaveBeenCalled();
  });
  it('does not submit or fail a replacement claim when submission ownership is lost', async () => {
    const f = fixture();
    f.setRow({
      id: actionId,
      merchantId,
      status: 'APPROVED',
      exception: f.exception,
      actionType: 'REFUND',
      parameters: f.dto.parameters,
    });
    f.prisma.action.updateMany.mockResolvedValueOnce({ count: 0 });
    await f.service.executeAction(actionId, merchantId);
    expect(f.gateway.createRefund).not.toHaveBeenCalled();
    expect(f.prisma.action.updateMany).toHaveBeenCalledTimes(1);
  });
  it.each(['MARK_REVIEWED', 'ESCALATE', 'CREATE_PAYMENT_LINK'])(
    'audits preserved parent state and records %s completion when the active transition is refused',
    async (type) => {
      const f = fixture();
      const action = {
        id: actionId,
        merchantId,
        exceptionId,
        status: 'EXECUTING',
        actionType: type,
        parameters: { amount: 10000 },
      };
      f.setRow(action);
      f.prisma.exception.updateMany.mockResolvedValueOnce({ count: 0 });
      await (f.service as any).finish(
        action,
        type === 'CREATE_PAYMENT_LINK'
          ? {
              id: 'plink_test',
              amount: 10000,
              currency: 'INR',
              reference_id: actionId,
              short_url: 'https://example.invalid/late',
            }
          : {},
        userId,
      );
      expect(f.prisma.exception.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: exceptionId,
            merchantId,
            status: { in: ['OPEN', 'INVESTIGATING'] },
          },
        }),
      );
      expect(f.row().status).toBe('COMPLETED');
      expect(f.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ACTION_PARENT_STATE_PRESERVED',
          }),
        }),
      );
      expect(f.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ACTION_EXECUTED' }),
        }),
      );
    },
  );
  it('does not record completion when the preserved-parent audit cannot persist', async () => {
    const f = fixture();
    const action = {
      id: actionId,
      merchantId,
      exceptionId,
      status: 'EXECUTING',
      actionType: 'MARK_REVIEWED',
      parameters: {},
    };
    f.setRow(action);
    f.prisma.exception.updateMany.mockResolvedValueOnce({ count: 0 });
    f.prisma.auditLog.create.mockRejectedValueOnce(
      new Error('audit unavailable'),
    );
    await expect((f.service as any).finish(action, {}, userId)).rejects.toThrow(
      'audit unavailable',
    );
    expect(f.prisma.action.update).not.toHaveBeenCalled();
  });
});
