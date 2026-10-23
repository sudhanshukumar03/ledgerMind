import { Injectable } from "@nestjs/common";
import { ActionType, Role } from "@prisma/client";
import { positiveSafePaise } from "../../common/utils/pagination.js";

@Injectable()
export class PolicyService {
  evaluate(action: {
    actionType: ActionType;
    amountInPaise?: number;
    userRole: Role;
  }): {
    allowed: boolean;
    approvalRequired: boolean;
    requiredApprovals: number;
    reason?: string;
  } {
    if (
      !Object.values(ActionType).includes(action.actionType) ||
      action.userRole === Role.VIEWER
    ) {
      return {
        allowed: false,
        approvalRequired: false,
        requiredApprovals: 0,
        reason: "Action requires FINANCE or ADMIN",
      };
    }
    const monetary =
      action.actionType === ActionType.REFUND ||
      action.actionType === ActionType.CREATE_PAYMENT_LINK;
    const amount = monetary ? positiveSafePaise(action.amountInPaise) : 0;
    const requiredApprovals =
      !monetary || amount < 100000 ? 0 : amount <= 5000000 ? 1 : 2;
    return {
      allowed: true,
      approvalRequired: requiredApprovals > 0,
      requiredApprovals,
    };
  }
}
