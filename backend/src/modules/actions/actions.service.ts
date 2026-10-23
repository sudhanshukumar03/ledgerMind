import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PolicyService } from './policy.service.js';
import { RazorpayClient } from '../../integrations/razorpay/razorpay.client.js';
import { CreateActionDto } from './dto/create-action.dto.js';
import { ApproveActionDto, RejectActionDto } from './dto/approve-action.dto.js';
import {
  Action,
  ActionStatus,
  ActionType,
  Exception,
  Prisma,
  Role,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  parseEnum,
  parsePagination,
  positiveSafePaise,
  requireInr,
  requireUuid,
} from '../../common/utils/pagination.js';

const activeReservations: ActionStatus[] = [
  'PENDING_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'OUTCOME_UNKNOWN',
];
const snapshot = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
const canonical = (value: any): any =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;

@Injectable()
export class ActionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActionsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private recovering = false;
  constructor(
    private prisma: PrismaService,
    private policyService: PolicyService,
    private razorpay: RazorpayClient,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.recoverExecution(), 10000);
    this.timer.unref();
    void this.recoverExecution();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async recoverExecution() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const expired = await this.prisma.action.findMany({
        where: {
          status: 'EXECUTING',
          executionProtocol: 'v2',
          executionLeaseUntil: { lt: new Date() },
        },
        take: 100,
      });
      for (const action of expired)
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM actions WHERE id = ${action.id}::uuid FOR UPDATE`;
          const current = await tx.action.findFirst({
            where: {
              id: action.id,
              status: 'EXECUTING',
              executionProtocol: 'v2',
              executionLeaseUntil: { lt: new Date() },
            },
          });
          if (!current) return;
          const changed = await tx.action.updateMany({
            where: {
              id: action.id,
              status: 'EXECUTING',
              executionLeaseUntil: { lt: new Date() },
            },
            data: {
              status: current.externalSubmittedAt
                ? 'OUTCOME_UNKNOWN'
                : 'APPROVED',
              executionLeaseUntil: null,
              executionClaimToken: current.externalSubmittedAt
                ? current.executionClaimToken
                : null,
              failureReason: current.externalSubmittedAt
                ? 'Execution interrupted after submission; verify provider outcome before further action'
                : null,
            },
          });
          if (changed.count)
            await this.audit(tx, current, null, 'ACTION_RECOVERED', {
              externalSubmittedAt: current.externalSubmittedAt,
              status: current.externalSubmittedAt
                ? 'OUTCOME_UNKNOWN'
                : 'APPROVED',
            });
        });
      const ready = await this.prisma.action.findMany({
        where: { status: 'APPROVED', executionProtocol: 'v2' },
        take: 100,
      });
      for (const action of ready) {
        try {
          await this.executeAction(action.id, action.merchantId);
        } catch (e) {
          this.logger.warn(String(e));
        }
      }
    } catch (e) {
      this.logger.warn(`Action recovery delayed: ${String(e)}`);
    } finally {
      this.recovering = false;
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    action: { id: string; merchantId: string },
    userId: string | null,
    event: string,
    after: unknown,
    reason?: string,
  ) {
    await tx.auditLog.create({
      data: {
        merchantId: action.merchantId,
        userId,
        actorType: userId ? 'USER' : 'SYSTEM',
        action: event,
        entityType: 'ACTION',
        entityId: action.id,
        afterState: snapshot(after),
        reason,
      },
    });
  }
  private mapAction(action: any) {
    if (!action) return null;
    return {
      ...action,
      reservedAmount: action.reservedAmount?.toString(),
      type: action.actionType,
      amount: action.parameters?.amount?.toString(),
      reason: action.parameters?.reason || action.reviewReason || '',
    };
  }
  private buildIdempotencyKey(
    exceptionId: string,
    actionType: ActionType,
    parameters: unknown,
  ) {
    const digest = createHash('sha256')
      .update(
        `${exceptionId}|${actionType}|${JSON.stringify(canonical(parameters ?? {}))}`,
      )
      .digest('hex');
    return `${exceptionId}:${actionType}:${digest.slice(0, 32)}`;
  }

  private async validateTarget(
    tx: Prisma.TransactionClient,
    exception: Exception,
    type: ActionType,
    params: Record<string, any>,
    excludeAction?: string,
  ) {
    if (type !== 'REFUND' && type !== 'CREATE_PAYMENT_LINK')
      return {
        params,
        targetPaymentId: null,
        targetOrderId: null,
        reservedAmount: 0n,
      };
    const amount = BigInt(positiveSafePaise(params.amount));
    if (type === 'REFUND') {
      const paymentId =
        params.payment_id ??
        (exception.primaryEntityType === 'PAYMENT'
          ? exception.primaryEntityId
          : null);
      if (!paymentId)
        throw new BadRequestException(
          'Select the related captured payment to refund',
        );
      requireUuid(paymentId);
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, merchantId: exception.merchantId },
      });
      if (!payment) throw new BadRequestException('Payment not found');
      requireInr(payment.currency);
      if (
        !['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
          payment.status,
        ) ||
        !payment.capturedAt
      )
        throw new BadRequestException(
          'Refund requires captured payment evidence',
        );
      let related =
        (exception.primaryEntityType === 'PAYMENT' &&
          exception.primaryEntityId === payment.id) ||
        (exception.primaryEntityType === 'ORDER' &&
          exception.primaryEntityId === payment.orderId);
      if (exception.primaryEntityType === 'REFUND') {
        const refund = await tx.refund.findUnique({
          where: { id: exception.primaryEntityId! },
        });
        related = refund?.paymentId === payment.id;
      }
      if (!related)
        throw new BadRequestException('Payment is unrelated to this exception');
      const refunds = await tx.refund.aggregate({
        where: {
          paymentId,
          status: { in: ['CREATED', 'PROCESSING', 'PROCESSED'] },
        },
        _sum: { amount: true },
      });
      const reserved = await tx.action.aggregate({
        where: {
          targetPaymentId: paymentId,
          status: { in: activeReservations },
          ...(excludeAction ? { id: { not: excludeAction } } : {}),
        },
        _sum: { reservedAmount: true },
      });
      if (
        amount +
          (refunds._sum.amount ?? 0n) +
          (reserved._sum.reservedAmount ?? 0n) >
        payment.amount
      )
        throw new BadRequestException(
          'Refund exceeds unreserved captured balance',
        );
      return {
        params: { ...params, payment_id: paymentId },
        targetPaymentId: paymentId,
        targetOrderId: null,
        reservedAmount: amount,
      };
    }
    const orderId =
      params.order_id ??
      (exception.primaryEntityType === 'ORDER'
        ? exception.primaryEntityId
        : null);
    if (!orderId)
      throw new BadRequestException('Payment link requires a related order');
    const isUuid = /^[0-9a-f-]{36}$/i.test(orderId);
    let order = await tx.order.findFirst({
      where: {
        merchantId: exception.merchantId,
        ...(isUuid ? { id: orderId } : { orderId }),
      },
    });
    if (
      !order ||
      exception.primaryEntityType !== 'ORDER' ||
      order.id !== exception.primaryEntityId
    )
      throw new BadRequestException('Order is unrelated to this exception');
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE`;
    order = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    requireInr(order.currency);
    if (!['CREATED', 'ATTEMPTED'].includes(order.status))
      throw new BadRequestException('Order is not collectible');
    const captures = await tx.payment.aggregate({
      where: {
        orderId: order.id,
        status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      },
      _sum: { amount: true },
    });
    if (amount > order.amount - (captures._sum.amount ?? 0n))
      throw new BadRequestException(
        'Payment link exceeds outstanding order amount',
      );
    const pendingLink = await tx.action.findFirst({
      where: {
        merchantId: exception.merchantId,
        actionType: 'CREATE_PAYMENT_LINK',
        status: { in: [...activeReservations, 'COMPLETED'] },
        OR: [
          { targetOrderId: order.id },
          // Older rows predate the dedicated target. Keep them protective too.
          {
            targetOrderId: null,
            OR: [
              { parameters: { path: ['order_id'], equals: order.id } },
              { parameters: { path: ['order_id'], equals: order.orderId } },
              {
                exception: {
                  primaryEntityType: 'ORDER',
                  primaryEntityId: order.id,
                },
              },
            ],
          },
        ],
        ...(excludeAction ? { id: { not: excludeAction } } : {}),
      },
    });
    if (pendingLink)
      throw new BadRequestException(
        'An active payment link already exists for this order',
      );
    return {
      params: { ...params, order_id: order.id },
      targetPaymentId: null,
      targetOrderId: order.id,
      reservedAmount: 0n,
    };
  }

  async createAction(userId: string, dto: CreateActionDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const policy = this.policyService.evaluate({
      actionType: dto.action_type,
      amountInPaise: dto.parameters?.amount,
      userRole: user.role,
    });
    if (!policy.allowed) throw new ForbiddenException(policy.reason);
    const key = this.buildIdempotencyKey(
      dto.exception_id,
      dto.action_type,
      dto.parameters,
    );
    const action = await this.prisma.$transaction(async (tx) => {
      let exception = await tx.exception.findFirst({
        where: { id: dto.exception_id, merchantId: user.merchantId },
      });
      if (!exception) throw new NotFoundException('Exception not found');
      await tx.$queryRaw`SELECT id FROM exceptions WHERE id = ${exception.id}::uuid FOR UPDATE`;
      exception = await tx.exception.findFirstOrThrow({
        where: { id: exception.id, merchantId: user.merchantId },
      });
      const existing = await tx.action.findUnique({
        where: { idempotencyKey: key },
      });
      if (existing) return existing;
      this.assertExecutionEnabled(dto.action_type);
      if (['RESOLVED', 'IGNORED'].includes(exception.status))
        throw new BadRequestException('Exception is not actionable');
      const target = await this.validateTarget(
        tx,
        exception,
        dto.action_type,
        dto.parameters ?? {},
      );
      const created = await tx.action.create({
        data: {
          merchantId: user.merchantId,
          exceptionId: exception.id,
          actionType: dto.action_type,
          parameters: target.params,
          targetPaymentId: target.targetPaymentId,
          targetOrderId: target.targetOrderId,
          reservedAmount: target.reservedAmount,
          status: policy.approvalRequired ? 'PENDING_APPROVAL' : 'APPROVED',
          requestedById: userId,
          approvalRequired: policy.approvalRequired,
          requiredApprovals: policy.requiredApprovals,
          executionProtocol: 'v2',
          policyDecision: snapshot(policy),
          idempotencyKey: key,
        },
      });
      await this.audit(tx, created, userId, 'ACTION_PROPOSED', created);
      return created;
    });
    if (action.status === 'APPROVED')
      await this.executeAction(action.id, user.merchantId, userId);
    return this.mapAction(
      await this.prisma.action.findUnique({
        where: { id: action.id },
        include: { approvals: true },
      }),
    );
  }
  async getActions(
    merchantId: string,
    status?: ActionStatus,
    page = 1,
    limit = 100,
  ) {
    parseEnum(status, Object.values(ActionStatus), 'status');
    ({ page, limit } = parsePagination(page, limit));
    const actions = await this.prisma.action.findMany({
      where: { merchantId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        approvals: true,
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        exception: true,
      },
    });
    return actions.map((a) => this.mapAction(a));
  }
  async getActionById(id: string, merchantId: string) {
    requireUuid(id);
    const action = await this.prisma.action.findFirst({
      where: { id, merchantId },
      include: { exception: true, approvals: true },
    });
    if (!action) throw new NotFoundException('Action not found');
    return action;
  }
  async approveAction(
    id: string,
    userId: string,
    merchantId: string,
    dto: ApproveActionDto,
  ) {
    const action = await this.review(id, userId, merchantId, dto.reason, true);
    if (action.status === 'APPROVED')
      await this.executeAction(id, merchantId, userId);
    return this.mapAction(
      await this.prisma.action.findUnique({
        where: { id },
        include: { approvals: true },
      }),
    );
  }
  async rejectAction(
    id: string,
    userId: string,
    merchantId: string,
    dto: RejectActionDto,
  ) {
    return this.mapAction(
      await this.review(id, userId, merchantId, dto.reason, false),
    );
  }
  private async review(
    id: string,
    userId: string,
    merchantId: string,
    reason: string,
    approve: boolean,
  ) {
    requireUuid(id);
    if (!reason?.trim())
      throw new BadRequestException('A review reason is required');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM actions WHERE id = ${id}::uuid FOR UPDATE`;
      const action = await tx.action.findFirst({
        where: { id, merchantId },
        include: { approvals: true },
      });
      const user = await tx.user.findFirst({
        where: { id: userId, merchantId },
      });
      if (!action) throw new NotFoundException('Action not found');
      if (
        !user ||
        user.role === Role.VIEWER ||
        (approve && user.role !== Role.ADMIN)
      )
        throw new ForbiddenException('Review role is not allowed');
      if (action.status !== 'PENDING_APPROVAL')
        throw new BadRequestException('Action is not pending approval');
      if (approve && action.executionProtocol !== 'v2')
        throw new BadRequestException(
          'Legacy intent requires manual review before a new proposal',
        );
      if (approve && action.requestedById === userId)
        throw new ForbiddenException(
          'Requester cannot approve their own action',
        );
      if (approve && action.approvals.some((a) => a.userId === userId))
        throw new BadRequestException('This approver has already voted');
      if (approve)
        await tx.actionApproval.create({
          data: { actionId: id, userId, reason: reason.trim() },
        });
      const status = !approve
        ? 'REJECTED'
        : action.approvals.length + 1 >= action.requiredApprovals
          ? 'APPROVED'
          : 'PENDING_APPROVAL';
      const updated = await tx.action.update({
        where: { id },
        data: {
          status,
          reviewReason: reason.trim(),
          ...(approve ? { approvedById: userId, approvedAt: new Date() } : {}),
        },
      });
      await this.audit(
        tx,
        action,
        userId,
        approve ? 'ACTION_APPROVAL_RECORDED' : 'ACTION_REJECTED',
        updated,
        reason.trim(),
      );
      return updated;
    });
  }

  private assertExecutionEnabled(type: ActionType) {
    if (
      (type === 'REFUND' || type === 'CREATE_PAYMENT_LINK') &&
      this.razorpay.mode === 'disabled'
    )
      throw new BadRequestException(
        'Payment execution is disabled; choose simulation or provider_test explicitly',
      );
  }

  private async activeParent(
    tx: Prisma.TransactionClient,
    action: { exceptionId: string; merchantId: string },
  ) {
    await tx.$queryRaw`SELECT id FROM exceptions WHERE id = ${action.exceptionId}::uuid FOR UPDATE`;
    const parent = await tx.exception.findFirst({
      where: { id: action.exceptionId, merchantId: action.merchantId },
    });
    if (!parent || !['OPEN', 'INVESTIGATING'].includes(parent.status))
      throw new BadRequestException(
        'Exception is no longer active; unsubmitted action cannot execute',
      );
    return parent;
  }

  async executeAction(id: string, merchantId: string, actorId?: string) {
    let submitted = false;
    const claimToken = randomUUID();
    const action = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM actions WHERE id = ${id}::uuid FOR UPDATE`;
      const action = await tx.action.findFirst({
        where: { id, merchantId },
        include: { exception: true },
      });
      if (!action) throw new NotFoundException('Action not found');
      if (action.status !== 'APPROVED' || action.executionProtocol !== 'v2')
        return null;
      if (action.externalSubmittedAt) {
        const uncertain = await tx.action.update({
          where: { id },
          data: { status: 'OUTCOME_UNKNOWN', executionLeaseUntil: null },
        });
        await this.audit(
          tx,
          action,
          actorId ?? null,
          'ACTION_OUTCOME_UNKNOWN',
          uncertain,
        );
        return null;
      }
      try {
        this.assertExecutionEnabled(action.actionType);
        const parent = await this.activeParent(tx, action);
        await this.validateTarget(
          tx,
          parent,
          action.actionType,
          action.parameters as Record<string, any>,
          action.id,
        );
      } catch (error) {
        await tx.action.update({
          where: { id },
          data: { status: 'FAILED', failureReason: String(error) },
        });
        await this.audit(
          tx,
          action,
          actorId ?? null,
          'ACTION_VALIDATION_FAILED',
          { status: 'FAILED', error: String(error) },
        );
        return null;
      }
      const claimed = await tx.action.update({
        where: { id },
        data: {
          status: 'EXECUTING',
          executionProtocol: 'v2',
          executionLeaseUntil: new Date(Date.now() + 120000),
          executionClaimToken: claimToken,
          externalSubmittedAt: null,
        },
      });
      await this.audit(
        tx,
        action,
        actorId ?? null,
        'ACTION_EXECUTION_CLAIMED',
        { status: 'EXECUTING' },
      );
      return claimed;
    });
    if (!action) return;
    try {
      const params = action.parameters as Record<string, any>;
      let result: any = {};
      if (
        action.actionType === 'REFUND' ||
        action.actionType === 'CREATE_PAYMENT_LINK'
      ) {
        // Persist the uncertainty boundary before issuing the external request.
        // Expired submitted operations are never automatically re-issued.
        const marked = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM actions WHERE id = ${id}::uuid FOR UPDATE`;
          const where = {
            id,
            status: 'EXECUTING' as const,
            executionClaimToken: claimToken,
            executionLeaseUntil: { gt: new Date() },
            externalSubmittedAt: null,
          };
          if (!(await tx.action.findFirst({ where }))) return { count: 0 };
          // Parent decisions and the durable submission boundary serialize on
          // the parent row. After this commit the outcome is conservatively unknown.
          await this.activeParent(tx, action);
          return tx.action.updateMany({
            where: { ...where, executionLeaseUntil: { gt: new Date() } },
            data: { externalSubmittedAt: new Date() },
          });
        });
        if (!marked.count) return; // A stale owner must not mutate a replacement claim.
        submitted = true;
        if (action.actionType === 'REFUND') {
          const payment = await this.prisma.payment.findUniqueOrThrow({
            where: { id: params.payment_id },
          });
          result = await this.razorpay.createRefund(
            payment.paymentId,
            params.amount,
            id,
          );
        } else {
          const order = await this.prisma.order.findUniqueOrThrow({
            where: { id: params.order_id },
          });
          result = await this.razorpay.createPaymentLink(
            order.orderId,
            params.amount,
            id,
          );
        }
      }
      await this.finish(action, result, actorId);
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        const status = submitted ? 'OUTCOME_UNKNOWN' : 'FAILED';
        const changed = await tx.action.updateMany({
          where: { id, status: 'EXECUTING', executionClaimToken: claimToken },
          data: {
            status,
            failureReason: String(error),
            executionLeaseUntil: null,
            executionClaimToken: submitted ? claimToken : null,
          },
        });
        if (changed.count)
          await this.audit(
            tx,
            action,
            actorId ?? null,
            submitted ? 'ACTION_OUTCOME_UNKNOWN' : 'ACTION_FAILED',
            { status, error: String(error) },
          );
      });
      throw error;
    }
  }

  private async finish(action: Action, result: any, actorId?: string) {
    const params = action.parameters as Record<string, any>;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM actions WHERE id = ${action.id}::uuid FOR UPDATE`;
      const current = await tx.action.findUniqueOrThrow({
        where: { id: action.id },
      });
      const linkRefresh =
        current.actionType === 'CREATE_PAYMENT_LINK' &&
        current.status === 'COMPLETED';
      const inactiveLink =
        current.actionType === 'CREATE_PAYMENT_LINK' &&
        ['cancelled', 'expired'].includes(result.status);
      if (
        !['EXECUTING', 'OUTCOME_UNKNOWN'].includes(current.status) &&
        !linkRefresh
      )
        return;
      if (
        (current.executionClaimToken ?? null) !==
        (action.executionClaimToken ?? null)
      )
        return;
      if (
        current.status === 'EXECUTING' &&
        current.executionLeaseUntil &&
        current.executionLeaseUntil <= new Date() &&
        !current.externalSubmittedAt
      )
        return;
      if (
        action.actionType === 'REFUND' ||
        action.actionType === 'CREATE_PAYMENT_LINK'
      ) {
        if (BigInt(positiveSafePaise(result.amount)) !== BigInt(params.amount))
          throw new Error('Provider amount does not match requested amount');
        requireInr(result.currency);
        if (typeof result.id !== 'string' || !result.id)
          throw new Error('Missing provider operation identity');
        if (
          action.actionType === 'CREATE_PAYMENT_LINK' &&
          (result.reference_id !== action.id ||
            typeof result.short_url !== 'string' ||
            !result.short_url.startsWith('https://'))
        )
          throw new Error('Invalid provider payment link evidence');
        if (linkRefresh && (current.executionResult as any)?.id !== result.id)
          throw new Error(
            'Provider link identity differs from the recorded operation',
          );
      }
      if (action.actionType === 'REFUND') {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${params.payment_id}::uuid FOR UPDATE`;
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: params.payment_id },
        });
        if (result.payment_id !== payment.paymentId)
          throw new Error('Provider refund targets a different payment');
        if (
          typeof result.id !== 'string' ||
          BigInt(positiveSafePaise(result.amount)) !== BigInt(params.amount)
        )
          throw new Error('Provider refund does not match requested amount');
        const existingRefund = await tx.refund.findUnique({
          where: { refundId: result.id },
        });
        if (
          existingRefund &&
          (existingRefund.merchantId !== action.merchantId ||
            existingRefund.paymentId !== params.payment_id ||
            existingRefund.amount !== BigInt(params.amount))
        )
          throw new Error(
            'Provider refund identity conflicts with existing evidence',
          );
        await tx.refund.upsert({
          where: { refundId: result.id },
          create: {
            refundId: result.id,
            merchantId: action.merchantId,
            paymentId: params.payment_id,
            amount: BigInt(params.amount),
            status:
              result.status === 'processed'
                ? 'PROCESSED'
                : result.status === 'failed'
                  ? 'FAILED'
                  : 'PROCESSING',
            processedAt: result.status === 'processed' ? new Date() : null,
          },
          update:
            existingRefund?.status === 'PROCESSED'
              ? {}
              : {
                  status:
                    result.status === 'processed'
                      ? 'PROCESSED'
                      : result.status === 'failed'
                        ? 'FAILED'
                        : 'PROCESSING',
                  ...(result.status === 'processed'
                    ? { processedAt: new Date() }
                    : {}),
                },
        });
        if (result.status === 'processed') {
          const processed = await tx.refund.aggregate({
            where: { paymentId: params.payment_id, status: 'PROCESSED' },
            _sum: { amount: true },
          });
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status:
                (processed._sum.amount ?? 0n) >= payment.amount
                  ? 'REFUNDED'
                  : 'PARTIALLY_REFUNDED',
            },
          });
        }
      }
      if (
        !inactiveLink &&
        !linkRefresh &&
        (action.actionType === 'MARK_REVIEWED' ||
          action.actionType === 'ESCALATE' ||
          action.actionType === 'CREATE_PAYMENT_LINK')
      ) {
        // Evaluate eligibility in the UPDATE itself, including after a concurrent
        // row-lock wait. A late result must not reopen a terminal decision.
        const parentTransition = await tx.exception.updateMany({
          where: {
            id: action.exceptionId,
            merchantId: action.merchantId,
            status: { in: ['OPEN', 'INVESTIGATING'] },
          },
          data: {
            status: 'INVESTIGATING',
            ...(action.actionType === 'ESCALATE'
              ? { severity: 'CRITICAL' }
              : {}),
            ...(result.short_url
              ? { resolutionNote: `Payment link created: ${result.short_url}` }
              : {}),
          },
        });
        if (!parentTransition.count)
          await this.audit(
            tx,
            action,
            actorId ?? null,
            'ACTION_PARENT_STATE_PRESERVED',
            { exceptionId: action.exceptionId, parentTransitionApplied: false },
            'No eligible active parent state; preserve the current lifecycle decision',
          );
      }
      const completed = await tx.action.update({
        where: { id: action.id },
        data: {
          status:
            result.status === 'failed' || inactiveLink ? 'FAILED' : 'COMPLETED',
          executionResult: snapshot(result),
          executedAt: current.executedAt ?? new Date(),
          executionLeaseUntil: null,
          executionClaimToken: null,
          failureReason: inactiveLink
            ? `Provider confirms payment link ${result.status}`
            : null,
        },
      });
      await this.audit(
        tx,
        action,
        actorId ?? null,
        inactiveLink
          ? 'ACTION_PAYMENT_LINK_INACTIVE'
          : linkRefresh
            ? 'ACTION_PROVIDER_OUTCOME_VERIFIED'
            : 'ACTION_EXECUTED',
        completed,
      );
    });
  }

  async recoverOutcome(
    id: string,
    userId: string,
    merchantId: string,
    providerId: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, merchantId, role: 'ADMIN' },
    });
    if (!user)
      throw new ForbiddenException(
        'Only ADMIN may verify an uncertain outcome',
      );
    const action = await this.getActionById(id, merchantId);
    if (
      action.status !== 'OUTCOME_UNKNOWN' &&
      !(
        action.actionType === 'CREATE_PAYMENT_LINK' &&
        action.status === 'COMPLETED'
      )
    )
      throw new BadRequestException(
        'Action is not awaiting provider verification or an active completed payment link',
      );
    if (typeof providerId !== 'string' || !/^[a-zA-Z0-9_]+$/.test(providerId))
      throw new BadRequestException('Provider id required');
    const params = action.parameters as Record<string, any>;
    const result = await this.razorpay.fetchOutcome(
      action.actionType,
      providerId,
    );
    if (action.actionType === 'REFUND') {
      const payment = await this.prisma.payment.findUniqueOrThrow({
        where: { id: params.payment_id },
      });
      if (
        result.payment_id !== payment.paymentId ||
        result.notes?.operation_id !== id
      )
        throw new BadRequestException(
          'Provider evidence is unrelated to this operation',
        );
    } else if (result.reference_id !== id)
      throw new BadRequestException(
        'Provider evidence is unrelated to this operation',
      );
    await this.finish(action, result, userId);
    return this.mapAction(
      await this.prisma.action.findUnique({ where: { id } }),
    );
  }
}
