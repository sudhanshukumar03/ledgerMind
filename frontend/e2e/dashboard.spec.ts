import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('logs in and loads dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@ledgermind.dev');
    await page.fill('#password', 'demo1234');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');

    await expect(page.getByText('Total Exceptions (All Time)')).toBeVisible();
    await expect(page.getByText('Recent Exceptions')).toBeVisible();
  });
});
