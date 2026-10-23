import { PolicyService } from "./policy.service.js";
import { ActionType, Role } from "@prisma/client";

describe("PolicyService approval boundaries in integer paise", () => {
  const policy = new PolicyService();
  it.each([1, 99999, 100000, 5000000, 5000001])(
    "blocks VIEWER for amount %s",
    (amount) => {
      expect(
        policy.evaluate({
          actionType: "REFUND",
          amountInPaise: amount,
          userRole: Role.VIEWER,
        }).allowed,
      ).toBe(false);
    },
  );
  it.each([
    [1, 0],
    [99999, 0],
    [100000, 1],
    [5000000, 1],
    [5000001, 2],
  ])("amount %s needs %s distinct approvals", (amount, count) => {
    for (const actionType of [
      ActionType.REFUND,
      ActionType.CREATE_PAYMENT_LINK,
    ]) {
      expect(
        policy.evaluate({
          actionType,
          amountInPaise: amount,
          userRole: Role.FINANCE,
        }),
      ).toMatchObject({
        allowed: true,
        approvalRequired: count > 0,
        requiredApprovals: count,
      });
    }
  });
  it.each([undefined, 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid amount %s",
    (amount) => {
      expect(() =>
        policy.evaluate({
          actionType: "REFUND",
          amountInPaise: amount,
          userRole: Role.ADMIN,
        }),
      ).toThrow();
    },
  );
  it("denies unknown types", () =>
    expect(
      policy.evaluate({ actionType: "UNKNOWN" as any, userRole: Role.ADMIN })
        .allowed,
    ).toBe(false));
  it("permits nonfinancial review by FINANCE", () =>
    expect(
      policy.evaluate({ actionType: "MARK_REVIEWED", userRole: Role.FINANCE }),
    ).toMatchObject({ allowed: true, requiredApprovals: 0 }));
});
