const { chromium } = require('playwright');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'admin@ledgermind.dev');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  
  // Wait for dashboard to load
  await page.waitForURL('http://localhost:3000/');
  await page.waitForTimeout(2000); // Wait for animations
  
  // Take dashboard screenshot
  await page.screenshot({ path: path.join(__dirname, '../docs/assets/dashboard.png') });
  
  // Navigate to exceptions
  await page.goto('http://localhost:3000/exceptions');
  await page.waitForTimeout(1000);
  
  // Click first exception or navigate to mock
  // Let's just navigate to a fake investigation page or click the first one
  const rows = await page.$$('tbody tr');
  if (rows.length > 0) {
    await rows[0].click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, '../docs/assets/investigation.png') });
  } else {
    // If no exceptions, just take a screenshot of the exceptions page
    await page.screenshot({ path: path.join(__dirname, '../docs/assets/investigation.png') });
  }
  
  await browser.close();
  console.log('Screenshots taken');
}

run().catch(console.error);
