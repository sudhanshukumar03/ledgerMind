import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const browser = await chromium.launch({ headless: true });
  // Force dark mode via emulation
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  
  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'admin@ledgermind.dev');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  
  // Wait for dashboard to load
  await page.waitForURL('http://localhost:3000/');
  await page.waitForTimeout(2000); // Wait for animations
  
  // If the page didn't pick up the system dark mode, click the toggle
  // Check if html has class 'dark'
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (!isDark) {
    console.log("Clicking theme toggle...");
    await page.click('button[title="Toggle dark mode"]');
    await page.waitForTimeout(500);
  }
  
  // Take dashboard screenshot
  await page.screenshot({ path: path.join(__dirname, '../docs/assets/dashboard-dark.png') });
  
  // Navigate to exceptions
  await page.goto('http://localhost:3000/exceptions');
  await page.waitForTimeout(1000);
  
  const rows = await page.$$('tbody tr');
  if (rows.length > 0) {
    await rows[0].click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, '../docs/assets/investigation-dark.png') });
  } else {
    await page.screenshot({ path: path.join(__dirname, '../docs/assets/investigation-dark.png') });
  }
  
  await browser.close();
  console.log('Dark mode screenshots taken');
}

run().catch(console.error);
