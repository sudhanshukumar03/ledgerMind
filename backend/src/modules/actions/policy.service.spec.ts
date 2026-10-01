import { PolicyService } from './policy.service.js';
import { ActionType, Role } from '@prisma/client';

/**
 * PolicyService is the deterministic gate that decides whether an action is
 * allowed and whether it needs human approval. These tests lock in the RBAC
 * and refund-threshold guarantees so a refactor can't silently loosen them.
 *
 * Threshold is AUTO_APPROVE_BELOW_AMOUNT (paise), default 1000. The service
 * reads it in its field initialiser, so we assert against the default.
 */
describe('PolicyService', () => {
  let service: PolicyService;

  beforeEach(() => {
    delete process.env.AUTO_APPROVE_BELOW_AMOUNT; // use the documented default (1000)
    service = new PolicyService();
  });

  it('denies unsupported action types outright', () => {
    const result = service.evaluate({
      actionType: 'SOMETHING_ELSE' as ActionType,
      userRole: Role.ADMIN,
    });
    expect(result).toEqual({ allowed: false, approvalRequired: false, reason: 'Action type not supported' });
  });

  describe('REFUND', () => {
    it('blocks VIEWER regardless of amount (small)', () => {
      const r = service.evaluate({ actionType: ActionType.REFUND, amountInPaise: 500, userRole: Role.VIEWER });
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/viewer/i);
    });

    it('blocks VIEWER regardless of amount (large)', () => {
      const r = service.evaluate({ actionType: ActionType.REFUND, amountInPaise: 50_000, userRole: Role.VIEWER });
      expect(r.allowed).toBe(false);
    });

    it('auto-approves a small refund (<= threshold) for FINANCE', () => {
      const r = service.evaluate({ actionType: ActionType.REFUND, amountInPaise: 1000, userRole: Role.FINANCE });
      expect(r).toEqual({ allowed: true, approvalRequired: false });
    });

    it('requires approval for a refund above the threshold', () => {
      const r = service.evaluate({ actionType: ActionType.REFUND, amountInPaise: 1001, userRole: Role.FINANCE });
      expect(r).toEqual({ allowed: true, approvalRequired: true });
    });

    it('treats a missing amount as 0 (auto-approve for non-viewer)', () => {
      const r = service.evaluate({ actionType: ActionType.REFUND, userRole: Role.ADMIN });
      expect(r).toEqual({ allowed: true, approvalRequired: false });
    });
  });

  describe('non-refund actions (MARK_REVIEWED / ESCALATE)', () => {
    it('blocks VIEWER', () => {
      const r = service.evaluate({ actionType: ActionType.MARK_REVIEWED, userRole: Role.VIEWER });
      expect(r.allowed).toBe(false);
    });

    it('allows FINANCE but requires approval', () => {
      const r = service.evaluate({ actionType: ActionType.ESCALATE, userRole: Role.FINANCE });
      expect(r).toEqual({ allowed: true, approvalRequired: true });
    });
  });

  it('honours a custom AUTO_APPROVE_BELOW_AMOUNT', () => {
    process.env.AUTO_APPROVE_BELOW_AMOUNT = '5000';
    const custom = new PolicyService();
    expect(custom.evaluate({ actionType: ActionType.REFUND, amountInPaise: 4000, userRole: Role.FINANCE }).approvalRequired).toBe(false);
    expect(custom.evaluate({ actionType: ActionType.REFUND, amountInPaise: 6000, userRole: Role.FINANCE }).approvalRequired).toBe(true);
  });
});
