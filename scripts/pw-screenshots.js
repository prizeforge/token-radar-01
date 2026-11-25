// Playwright screenshot script for Token Radar v5 verification.
// Run from repo root: node scripts/pw-screenshots.js

const path = require('path');
const { chromium } = require('/home/hatch/.npm/_npx/705bc6b22212b352/node_modules/playwright-core');

const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const ROOT = path.resolve(__dirname, '..');
const DASH = 'file://' + ROOT + '/out/dashboard/index.html';

async function run() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto(DASH, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Run __radarCheck
  const check = await page.evaluate(() => window.__radarCheck());
  console.log('__radarCheck rows:', check.rows, 'mismatches:', check.mismatches);
  if (check.mismatches > 0) {
    console.error('MISMATCH:', JSON.stringify(check.bad.slice(0, 3)));
  }

  // Screenshot 1: board overview
  await page.screenshot({ path: ROOT + '/screenshots/1-board.png' });
  console.log('1-board.png saved');

  // Screenshot 2: detail panel (click first data row)
  await page.click('#rows tr:first-child');
  await page.waitForTimeout(600);
  await page.screenshot({ path: ROOT + '/screenshots/2-detail.png' });
  console.log('2-detail.png saved');

  // Screenshot 3: filtered (close detail by clicking the selected row again — v2 has no .d-close button; a second click on the same row hides the panel, app.js:427 — then switch scope to watchlist)
  await page.click('#rows tr:first-child');
  await page.waitForTimeout(400);
  await page.selectOption('#scope', 'watchlist');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0)); // detail scrollIntoView left the page scrolled; reset to top for a clean capture
  await page.screenshot({ path: ROOT + '/screenshots/3-filtered.png' });
  console.log('3-filtered.png saved');

  console.log('Console errors:', consoleErrors.length === 0 ? 'none' : consoleErrors.join('\n'));

  await browser.close();

  if (check.mismatches !== 0) process.exit(1);
  if (consoleErrors.length > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
