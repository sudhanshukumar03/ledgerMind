import { Page } from '@playwright/test';

export function apiPath(url: URL): string {
  return url.pathname.replace(/^\/api(?:\/v1)?(?=\/|$)/, '');
}

// Every fixture override uses the same prefix rules as the global handler.
export function apiRoute(path?: string, includeChildren = false) {
  return (url: URL) => {
    if (!/^\/api(?:\/v1)?(?:\/|$)/.test(url.pathname)) return false;
    const normalized = apiPath(url);
    return (
      path === undefined ||
      normalized === path ||
      (includeChildren && normalized.startsWith(`${path}/`))
    );
  };
}
export const ids = {
  exception: '11111111-1111-4111-8111-111111111111',
  payment: '22222222-2222-4222-8222-222222222222',
  payment2: '22222222-2222-4222-8222-222222222223',
  action: '33333333-3333-4333-8333-333333333333',
  order: '44444444-4444-4444-8444-444444444444',
};
export const exception = {
  id: ids.exception,
  exceptionId: 'EXC-SYNTHETIC',
  type: 'DUPLICATE_PAYMENT',
  severity: 'HIGH',
  status: 'OPEN',
  financialImpact: '10000',
  primaryEntityType: 'ORDER',
  primaryEntityId: ids.order,
  createdAt: '2026-10-21T00:00:00Z',
  aiAnalyses: [],
  eligiblePayments: [
    { id: ids.payment, paymentId: 'pay_fixture_A', remainingAmount: '10000' },
    { id: ids.payment2, paymentId: 'pay_fixture_B', remainingAmount: '10000' },
  ],
};
const payment = {
  id: ids.payment,
  paymentId: 'pay_fixture_A',
  amount: '9007199254740993',
  currency: 'INR',
  status: 'CAPTURED',
  method: 'upi',
  createdAt: '2026-10-21T00:00:00Z',
  order: null,
  refunds: [],
};
const stats = {
  total_transaction_volume: '100000',
  reconciliation_rate: 50,
  open_exceptions: 1,
  critical_exceptions: 0,
  pending_approvals: 1,
  resolved_today: 1,
  exceptions_by_type: [{ type: 'DUPLICATE_PAYMENT', count: 1 }],
  exceptions_by_severity: [{ severity: 'HIGH', count: 1 }],
};
export async function fixture(
  page: Page,
  options: { scenario?: string; role?: string; loggedIn?: boolean } = {},
) {
  const { scenario = '', role = 'ADMIN', loggedIn = true } = options;
  await page.addInitScript(
    ({ role, loggedIn }) => {
      if (loggedIn) {
        localStorage.setItem('lm_token', 'synthetic-browser-fixture');
        localStorage.setItem(
          'lm_user',
          JSON.stringify({
            id: 'reviewer',
            name: 'Fixture User',
            role,
            merchantId: 'fixture',
          }),
        );
      }
    },
    { role, loggedIn },
  );
  await page.route(apiRoute(), async (route) => {
    const url = new URL(route.request().url());
    const path = apiPath(url);
    const method = route.request().method();
    let data: any,
      status = 200;
    if (
      (scenario === 'read-failure' &&
        [
          '/payments',
          '/exceptions',
          '/audit',
          '/actions',
          '/reconciliation/runs',
        ].includes(path)) ||
      (scenario === 'run-failure' && path === '/reconciliation/run')
    ) {
      status = 500;
      data = { message: 'Synthetic request failed' };
    } else if (path === '/auth/login') {
      status = 401;
      data = { message: 'Invalid email or password' };
    } else if (path === '/reconciliation/stats') data = stats;
    else if (path === '/reconciliation/runs')
      data = [
        {
          id: 'fixture-run',
          status: 'COMPLETED',
          startedAt: '2026-10-21T00:00:00Z',
          completedAt: '2026-10-21T00:01:00Z',
          totalRecords: 8,
          matchedCount: 3,
          exceptionCount: 2,
          capturedPayments: 2,
          matchedPayments: 1,
        },
      ];
    else if (path === '/reconciliation/run') data = { status: 'COMPLETED' };
    else if (path === '/exceptions')
      data = { data: [exception], total: 1, page: 1, limit: 20 };
    else if (path.startsWith('/exceptions/')) data = exception;
    else if (path === '/payments')
      data = {
        data: [
          payment,
          { ...payment, id: ids.payment2, paymentId: 'pay_fixture_B' },
        ],
        total: 2,
        page: 1,
        limit: 20,
      };
    else if (path.startsWith('/payments/')) {
      if (scenario === 'slow-first' && path.endsWith(ids.payment))
        await new Promise((r) => setTimeout(r, 600));
      data = path.endsWith(ids.payment2)
        ? { ...payment, id: ids.payment2, paymentId: 'pay_fixture_B' }
        : payment;
    } else if (path === '/settlements')
      data = { data: [], total: 0, page: 1, limit: 20 };
    else if (path === '/actions' && method === 'POST')
      data = {
        id: ids.action,
        status: 'COMPLETED',
        ...route.request().postDataJSON(),
      };
    else if (path === '/actions')
      data = [
        {
          id: ids.action,
          actionType: 'REFUND',
          type: 'REFUND',
          status: 'PENDING_APPROVAL',
          exceptionId: ids.exception,
          exception,
          requestedById: 'another-user',
          parameters: { amount: 100, reason: 'Fixture review' },
          createdAt: '2026-10-21T00:00:00Z',
        },
      ];
    else if (path.endsWith('/reject'))
      data = { id: ids.action, status: 'REJECTED' };
    else if (path === '/ai/config') data = { model: 'fixture', toolCount: 16 };
    else if (path.startsWith('/ai/investigate/'))
      data = {
        id: 'analysis',
        summary: 'Fixture analysis',
        likelyCause: 'Duplicate capture',
        confidence: 90,
        evidenceChain: [],
        nextSteps: [],
      };
    else if (path === '/audit')
      data = [
        {
          id: 'audit-fixture',
          action: 'RECONCILIATION',
          actorType: 'SYSTEM',
          entityType: 'RUN',
          afterState: { totalRecords: 400, amount: '9007199254740993' },
          createdAt: '2026-10-21T00:00:00Z',
        },
      ];
    else {
      status = 404;
      data = { message: `Missing fixture ${path}` };
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
}
