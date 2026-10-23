import { test, expect } from '@playwright/test';
import { fixture, ids, apiRoute, exception } from './fixtures';

test('an admin can verify a completed payment link and see its inactive outcome', async ({
  page,
}) => {
  await fixture(page);
  let verified = false;
  await page.route(apiRoute('/actions'), (route) =>
    route.fulfill({
      json: [
        {
          id: ids.action,
          actionType: 'CREATE_PAYMENT_LINK',
          status: verified ? 'FAILED' : 'COMPLETED',
          exceptionId: ids.exception,
          exception,
          parameters: { amount: 10000, reason: 'Synthetic payment link' },
          requestedById: 'another-user',
          createdAt: '2026-10-21T00:00:00Z',
          executionResult: {
            id: 'plink_fixture',
            status: verified ? 'cancelled' : 'created',
          },
        },
      ],
    }),
  );
  await page.route(
    apiRoute(`/actions/${ids.action}/recover`),
    async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({
        provider_id: 'plink_fixture',
      });
      verified = true;
      await route.fulfill({
        json: {
          id: ids.action,
          status: 'FAILED',
          executionResult: { id: 'plink_fixture', status: 'cancelled' },
        },
      });
    },
  );
  await page.goto('/actions');
  await page
    .getByRole('button', { name: 'Review Action', exact: true })
    .click();
  await page.getByLabel('Provider operation ID').fill('plink_fixture');
  await page
    .getByRole('button', { name: 'Verify Provider Outcome', exact: true })
    .click();
  await expect(
    page.getByText('Provider outcome verified and recorded', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review Action', exact: true }),
  ).toHaveCount(0);
  expect(verified).toBe(true);
});

test('AI proposal cards preserve exact paise at the safe-integer boundary', async ({
  page,
}) => {
  await fixture(page);
  await page.route(apiRoute('/ai/chat'), (route) =>
    route.fulfill({
      json: {
        message: 'Synthetic proposal for formatting verification',
        proposals: [
          {
            action_type: 'REFUND',
            exception_id: ids.exception,
            payment_id: ids.payment,
            amount: Number.MAX_SAFE_INTEGER,
            reason: 'Synthetic boundary amount',
          },
        ],
      },
    }),
  );
  await page.goto('/ai-controller');
  await page.locator('#ai-chat-input').fill('Show the synthetic proposal');
  await page.locator('#ai-chat-send').click();
  await expect(
    page.getByText('\u20b99,00,71,99,25,47,409.91', { exact: true }),
  ).toBeVisible();
});

test('unavailable AI configuration does not invent a tool count', async ({
  page,
}) => {
  await fixture(page);
  await page.route(apiRoute('/ai/config'), (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Synthetic config unavailable' },
    }),
  );
  await page.goto('/ai-controller');
  await expect(
    page.getByText('Tool count unavailable', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/14 tools available/)).toHaveCount(0);
});

test('dashboard shows truthful scope, rate, and valid header color', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/');
  await expect(
    page.getByText('Active Exceptions', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('50.0%', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Reconciliation overview:', { exact: false }),
  ).toContainText('captured (all time)');
  const color = await page
    .locator('header')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(color).not.toBe('rgba(0, 0, 0, 0)');
});

test('failed run shows failure feedback', async ({ page }) => {
  await fixture(page, { scenario: 'run-failure' });
  await page.goto('/');
  await expect(
    page.getByText('Active Exceptions', { exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse((r) =>
    r.url().endsWith('/reconciliation/run'),
  );
  await page.getByRole('button', { name: 'Run Now', exact: true }).click();
  expect((await response).status()).toBe(500);
  await expect(
    page.getByText('Synthetic request failed', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Reconciliation run completed.', { exact: true }),
  ).toHaveCount(0);
});

test('login failure retains inline feedback without navigation', async ({
  page,
}) => {
  await fixture(page, { loggedIn: false });
  await page.goto('/login');
  await page.locator('#email').fill('fixture@example.invalid');
  await page.locator('#password').fill('wrong-password');
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(
    page.getByText('Invalid email or password', { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('#email')).toHaveValue('fixture@example.invalid');
});

test('FINANCE can open and reject an action', async ({ page }) => {
  await fixture(page, { role: 'FINANCE' });
  await page.goto('/actions');
  await page
    .getByRole('button', { name: 'Review Action', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Record Approval', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Reject Action', exact: true })
    .click();
  await expect(
    page.getByText('Action rejected', { exact: true }),
  ).toBeVisible();
});
