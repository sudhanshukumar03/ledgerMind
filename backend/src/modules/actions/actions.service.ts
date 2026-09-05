import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PolicyService } from './policy.service.js';
import { RazorpayClient } from '../../integrations/razorpay/razorpay.client.js';
import { CreateActionDto } from './dto/create-action.dto.js';
import { ApproveActionDto, RejectActionDto } from './dto/approve-action.dto.js';
import { ActionStatus, ActionType, ExceptionStatus, Role } from '@prisma/client';

@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);

  constructor(
    private prisma: PrismaService,
    private policyService: PolicyService,
    private razorpay: RazorpayClient,
  ) {}

  async createAction(userId: string, createActionDto: CreateActionDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const exception = await this.prisma.exception.findUnique({
      where: { id: createActionDto.exception_id },
    });
    if (!exception) throw new NotFoundException('Exception not found');
    if (exception.merchantId !== user.merchantId) {
      throw new ForbiddenException('Exception does not belong to this merchant');
    }

    // Evaluate policy before creating
    const policyResult = this.policyService.evaluate({
      actionType: createActionDto.action_type,
      amountInPaise: createActionDto.parameters?.amount,
      userRole: user.role,
    });

    if (!policyResult.allowed) {
      throw new ForbiddenException(`Action denied by policy: ${policyResult.reason}`);
    }

    const action = await this.prisma.action.create({
      data: {
        merchantId: user.merchantId,
        exceptionId: exception.id,
        actionType: createActionDto.action_type,
        status: policyResult.approvalRequired ? ActionStatus.PENDING_APPROVAL : ActionStatus.APPROVED,
        parameters: createActionDto.parameters || {},
        requestedById: user.id,
        approvalRequired: policyResult.approvalRequired,
        policyDecision: policyResult as any,
        idempotencyKey: `${createActionDto.exception_id}-${createActionDto.action_type}-${JSON.stringify(createActionDto.parameters || {})}`,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        merchantId: user.merchantId,
        userId: user.id,
        actorType: 'USER',
        action: 'ACTION_PROPOSED',
        entityType: 'ACTION',
        entityId: action.id,
        afterState: action as any,
      },
    });

    // Execute immediately if no approval required
    if (!policyResult.approvalRequired) {
      await this.executeAction(action.id, user.merchantId, user.id);
    }

    return action;
  }

  async getActions(merchantId: string, status?: ActionStatus) {
    const where = { merchantId, ...(status ? { status } : {}) };
    return this.prisma.action.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { exception: true },
    });
  }

  async getActionById(id: string, merchantId: string) {
    const action = await this.prisma.action.findUnique({ where: { id } });
    if (!action || action.merchantId !== merchantId) {
      throw new NotFoundException('Action not found');
    }
    return action;
  }

  async approveAction(id: string, userId: string, merchantId: string, dto: ApproveActionDto) {
    const action = await this.getActionById(id, merchantId);
    if (action.status !== ActionStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Action is not pending approval');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role === Role.VIEWER) {
      throw new ForbiddenException('You do not have permission to approve actions');
    }

    const updatedCount = await this.prisma.action.updateMany({
      where: { id, status: ActionStatus.PENDING_APPROVAL },
      data: {
        status: ActionStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
        reviewReason: dto.reason,
      },
    });

    if (updatedCount.count === 0) {
      throw new BadRequestException('Action is not pending approval or already processed');
    }

    const updatedAction = await this.prisma.action.findUnique({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        merchantId,
        userId,
        actorType: 'USER',
        action: 'ACTION_APPROVED',
        entityType: 'ACTION',
        entityId: action.id,
        afterState: updatedAction as any,
        reason: dto.reason,
      },
    });

    // Trigger execution now that the action is approved
    await this.executeAction(id, merchantId, userId);

    return this.prisma.action.findUnique({ where: { id } });
  }

  async rejectAction(id: string, userId: string, merchantId: string, dto: RejectActionDto) {
    const action = await this.getActionById(id, merchantId);
    if (action.status !== ActionStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Action is not pending approval');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role === Role.VIEWER) {
      throw new ForbiddenException('You do not have permission to reject actions');
    }

    const updatedCount = await this.prisma.action.updateMany({
      where: { id, status: ActionStatus.PENDING_APPROVAL },
      data: {
        status: ActionStatus.REJECTED,
        reviewReason: dto.reason,
      },
    });

    if (updatedCount.count === 0) {
      throw new BadRequestException('Action is not pending approval or already processed');
    }

    const updatedAction = await this.prisma.action.findUnique({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        merchantId,
        userId,
        actorType: 'USER',
        action: 'ACTION_REJECTED',
        entityType: 'ACTION',
        entityId: action.id,
        afterState: updatedAction as any,
        reason: dto.reason,
      },
    });

    return updatedAction;
  }

  // ─── Execution Engine ───────────────────────────────────────────────────────

  /**
   * Executes an APPROVED action by calling the appropriate Razorpay API.
   * Transitions: APPROVED → EXECUTING → COMPLETED | FAILED
   * Records before/after state in audit_logs.
   * On REFUND completion, marks the parent exception RESOLVED.
   */
  async executeAction(actionId: string, merchantId: string, actorId?: string): Promise<void> {
    const action = await this.prisma.action.findUnique({ where: { id: actionId } });
    if (!action || action.merchantId !== merchantId) {
      throw new NotFoundException('Action not found');
    }
    if (action.status !== ActionStatus.APPROVED) {
      throw new BadRequestException(`Cannot execute action in status ${action.status}`);
    }

    const beforeState = { ...action } as any;

    // Mark EXECUTING atomically
    const updatedCount = await this.prisma.action.updateMany({
      where: { id: actionId, status: ActionStatus.APPROVED },
      data: { status: ActionStatus.EXECUTING },
    });

    if (updatedCount.count === 0) {
      throw new BadRequestException(`Cannot execute action - it may not be in APPROVED status or already executing`);
    }

    try {
      let result: any;

      switch (action.actionType) {
        case ActionType.REFUND:
          result = await this.executeRefund(action);
          break;

        case ActionType.CREATE_PAYMENT_LINK:
          result = await this.executeCreatePaymentLink(action);
          break;

        case ActionType.MARK_REVIEWED:
          result = await this.executeMarkReviewed(action);
          break;

        case ActionType.ESCALATE:
          result = await this.executeEscalate(action);
          break;

        default:
          throw new InternalServerErrorException(`Unknown action type: ${action.actionType}`);
      }

      // Atomically: mark COMPLETED + write audit log + resolve exception (if REFUND)
      await this.prisma.$transaction(async (tx) => {
        const completed = await tx.action.update({
          where: { id: actionId },
          data: {
            status: ActionStatus.COMPLETED,
            executionResult: result,
            executedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            merchantId,
            userId: actorId ?? null,
            actorType: actorId ? 'USER' : 'SYSTEM',
            action: 'ACTION_EXECUTED',
            entityType: 'ACTION',
            entityId: actionId,
            beforeState,
            afterState: completed as any,
            reason: `${action.actionType} executed successfully`,
          },
        });

        // Resolve the parent exception for money-moving actions
        if (action.actionType === ActionType.REFUND) {
          await tx.exception.update({
            where: { id: action.exceptionId },
            data: {
              status: ExceptionStatus.RESOLVED,
              resolvedAt: new Date(),
              resolutionNote: `Resolved by refund action ${actionId}`,
            },
          });
        }
      });
    } catch (error: any) {
      this.logger.error(`Action ${actionId} execution failed: ${error.message}`, error.stack);

      const failed = await this.prisma.action.update({
        where: { id: actionId },
        data: {
          status: ActionStatus.FAILED,
          failureReason: error.message,
        },
      });

      // Audit log — failure
      await this.prisma.auditLog.create({
        data: {
          merchantId,
          userId: actorId ?? null,
          actorType: actorId ? 'USER' : 'SYSTEM',
          action: 'ACTION_FAILED',
          entityType: 'ACTION',
          entityId: actionId,
          beforeState,
          afterState: failed as any,
          reason: error.message,
        },
      });

      throw error;
    }
  }

  // ─── Action-type handlers ────────────────────────────────────────────────────

  private async executeRefund(action: any): Promise<any> {
    const params = action.parameters as { payment_id?: string; amount?: number; reason?: string };

    if (!params.payment_id) {
      throw new BadRequestException('Refund action missing payment_id in parameters');
    }

    // Load payment
    const payment = await this.prisma.payment.findUnique({
      where: { id: params.payment_id },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    // Check merchant isolation
    if (payment.merchantId !== action.merchantId) {
      throw new ForbiddenException('Payment does not belong to merchant');
    }

    const refundAmount = BigInt(params.amount ?? 0);
    if (refundAmount > payment.amount) {
      throw new BadRequestException(
        `Refund amount ${refundAmount} exceeds original payment amount ${payment.amount}`,
      );
    }

    this.logger.log(
      `Issuing refund on payment ${payment.paymentId} for ₹${((params.amount ?? 0) / 100).toFixed(2)}`,
    );

    const refund = await this.razorpay.createRefund(payment.paymentId, params.amount);

    // Persist the refund record if not already present
    await this.prisma.refund.upsert({
      where: { refundId: refund.id },
      create: {
        refundId: refund.id,
        merchantId: action.merchantId,
        paymentId: await this.resolvePaymentPkId(params.payment_id, action.merchantId),
        amount: BigInt(refund.amount),
        status: 'PROCESSING',
      },
      update: {},
    });

    return { razorpay_refund_id: refund.id, amount: refund.amount, status: refund.status };
  }

  private async executeCreatePaymentLink(action: any): Promise<any> {
    const params = action.parameters as { order_id?: string; amount?: number };

    if (!params.order_id || !params.amount) {
      throw new BadRequestException('CREATE_PAYMENT_LINK action missing order_id or amount');
    }

    this.logger.log(`Creating payment link for order ${params.order_id}`);

    const link = await this.razorpay.createPaymentLink(params.order_id, params.amount);
    const result = { payment_link_id: link.id, short_url: link.short_url };

    // Annotate the exception so the UI can surface the payment link
    await this.prisma.exception.update({
      where: { id: action.exceptionId },
      data: {
        status: ExceptionStatus.INVESTIGATING,
        resolutionNote: `Payment link created: ${link.short_url}`,
      },
    });

    return result;
  }

  private async executeMarkReviewed(action: any): Promise<any> {
    await this.prisma.exception.update({
      where: { id: action.exceptionId },
      data: { status: ExceptionStatus.INVESTIGATING },
    });
    return { marked: 'INVESTIGATING' };
  }

  private async executeEscalate(action: any): Promise<any> {
    // Bump severity to CRITICAL, set status to INVESTIGATING for visible triage
    await this.prisma.exception.update({
      where: { id: action.exceptionId },
      data: {
        severity: 'CRITICAL',
        status: ExceptionStatus.INVESTIGATING,
        resolutionNote: `Escalated to CRITICAL by action ${action.id}`,
      },
    });
    return { escalated: true, newSeverity: 'CRITICAL', newStatus: 'INVESTIGATING' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Resolve the internal PK of a Payment row from its Razorpay payment_id.
   */
  private async resolvePaymentPkId(razorpayPaymentId: string, merchantId: string): Promise<string> {
    const payment = await this.prisma.payment.findFirst({
      where: { paymentId: razorpayPaymentId, merchantId },
      select: { id: true },
    });
    if (!payment) {
      throw new NotFoundException(
        `Payment with Razorpay ID ${razorpayPaymentId} not found for merchant ${merchantId}`,
      );
    }
    return payment.id;
  }
}

