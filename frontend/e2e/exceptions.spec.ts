import { test, expect } from '@playwright/test';
import { fixture, ids, exception, apiPath, apiRoute } from './fixtures';

test('searches on the server and submits the selected duplicate capture with a verified outcome', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/exceptions');
  const search = page.waitForRequest(
    (r) =>
      r.url().includes('/exceptions?') &&
      new URL(r.url()).searchParams.get('search') === 'DUPLICATE_PAYMENT',
  );
  await page.getByPlaceholder(/Search by ID or type/).fill('DUPLICATE_PAYMENT');
  await search;
  const row = page.locator('tr[data-exception-id]').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText('Details & AI Investigation')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Propose Refund', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Payment to refund').selectOption(ids.payment2);
  const request = page.waitForRequest(
    (r) => r.url().endsWith('/actions') && r.method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Propose Refund', exact: true })
    .click();
  expect((await request).postDataJSON().parameters.payment_id).toBe(
    ids.payment2,
  );
  await expect(page.getByText('Action REFUND: COMPLETED')).toBeVisible();
});

test('switching exceptions during a pending proposal resets mutation state', async ({
  page,
}) => {
  await fixture(page);
  const second = {
    ...exception,
    id: '11111111-1111-4111-8111-111111111112',
    exceptionId: 'EXC-SECOND',
  };
  await page.route(apiRoute('/exceptions', true), (route) => {
    const path = apiPath(new URL(route.request().url()));
    return route.fulfill({
      json:
        path === '/exceptions'
          ? { data: [exception, second], total: 2, page: 1, limit: 20 }
          : path.endsWith(second.id)
            ? second
            : exception,
    });
  });
  let received!: () => void, release!: () => void;
  const arrived = new Promise<void>((resolve) => {
    received = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(apiRoute('/actions'), async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    received();
    await pending;
    await route.fulfill({ json: { id: ids.action, status: 'COMPLETED' } });
  });
  try {
    await page.goto('/exceptions');
    await page.locator(`tr[data-exception-id="${ids.exception}"]`).click();
    await page
      .getByRole('button', { name: 'Mark for Review', exact: true })
      .click();
    await arrived;
    await page
      .locator(`tr[data-exception-id="${second.id}"]`)
      .dispatchEvent('click');
    await expect(
      page.getByRole('dialog').getByText('EXC-SECOND', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Mark for Review', exact: true }),
    ).toBeEnabled();
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/actions') && r.request().method() === 'POST',
    );
    release();
    await response;
    await expect(
      page.getByRole('button', { name: 'Escalate to Admin', exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText('Action MARK_REVIEWED: COMPLETED', { exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});

test('clearing status requests all statuses', async ({ page }) => {
  await fixture(page);
  await page.goto('/exceptions?status=');
  const query = page.waitForRequest(
    (r) =>
      r.url().includes('/exceptions?') &&
      !new URL(r.url()).searchParams.has('status'),
  );
  await page.reload();
  await query;
  await expect(page.locator('tr[data-exception-id]')).toHaveCount(1);
});

test('investigation timeout clears loading and allows retry', async ({
  page,
}) => {
  await fixture(page);
  await page.clock.install();
  await page.route('**/ai/investigate/**', async () => {
    await new Promise(() => {});
  });
  await page.goto(`/exceptions?exception=${ids.exception}`);
  const investigate = page.getByRole('button', { name: /Investigate/i }).last();
  await investigate.click();
  await page.clock.runFor(15001);
  await expect(
    page.getByText('Investigation timed out. Try again.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Try again|Investigate/i }).last(),
  ).toBeEnabled();
});
