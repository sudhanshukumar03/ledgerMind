import { Injectable } from '@nestjs/common';
import { ActionType, Role } from '@prisma/client';

@Injectable()
export class PolicyService {
  private readonly autoApproveBelowAmount: number =
    Number(process.env.AUTO_APPROVE_BELOW_AMOUNT) || 1000; // in paise

  /**
   * Evaluate an action proposal and return decision.
   */
  evaluate(action: {
    actionType: ActionType;
    amountInPaise?: number;
    userRole: Role;
  }): { allowed: boolean; approvalRequired: boolean; reason?: string } {
    // Only certain action types are allowed for MVP
    const allowedTypes = [
      ActionType.REFUND,
      ActionType.CREATE_PAYMENT_LINK,
      ActionType.MARK_REVIEWED,
      ActionType.ESCALATE,
    ];

    if (!allowedTypes.includes(action.actionType)) {
      return { allowed: false, approvalRequired: false, reason: 'Action type not supported' };
    }

    // For refunds, check amount and role
    if (action.actionType === ActionType.REFUND) {
      const amount = action.amountInPaise || 0;

      if (amount > this.autoApproveBelowAmount) {
        // Requires approval from admin or finance
        if (action.userRole === Role.VIEWER) {
          return { allowed: false, approvalRequired: true, reason: 'Viewer cannot request refunds' };
        }
        return { allowed: true, approvalRequired: true };
      } else {
        // Auto-approve for small refunds, but still require finance/admin role
        if (action.userRole === Role.VIEWER) {
          return { allowed: false, approvalRequired: false, reason: 'Viewer cannot request refunds' };
        }
        return { allowed: true, approvalRequired: false };
      }
    }

    // Other actions (mark reviewed, escalate) generally require finance/admin
    if (action.userRole === Role.VIEWER) {
      return { allowed: false, approvalRequired: false, reason: 'Viewer cannot perform this action' };
    }

    return { allowed: true, approvalRequired: true };
  }
}
