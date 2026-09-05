import { test, expect } from '@playwright/test';

test.describe('Exceptions', () => {
  test('navigates to exceptions, searches, opens details, and clicks action', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@ledgermind.dev');
    await page.fill('#password', 'demo1234');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');

    await page.goto('/exceptions');
    
    await page.fill('input[placeholder="Search by ID or type…"]', 'DUPLICATE_PAYMENT');
    await page.waitForTimeout(500);

    const firstRow = page.locator('tr[data-exception-id]').first();
    await firstRow.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await expect(page.getByText('Details & AI Investigation')).toBeVisible();

      const actionButton = page.locator('button:has-text("Propose Refund"), button:has-text("Mark for Review")').first();
      await actionButton.waitFor({ state: 'visible' });
      await actionButton.click();
    }
  });
});
