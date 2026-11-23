// Run Lighthouse programmatically via CDP on a fixed port
// Usage: node scripts/lighthouse-check.js [desktop|mobile]

const { chromium } = require('/home/hatch/.npm/_npx/705bc6b22212b352/node_modules/playwright-core');
const lighthouse = require('/home/hatch/.npm/_npx/ba16b138af87a83e/node_modules/lighthouse');
const path = require('path');
const fs = require('fs');

const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const URL_TO_AUDIT = 'http://localhost:8787/dashboard/';
const mode = process.argv[2] || 'desktop';

async function run() {
  const isDesktop = mode === 'desktop';
  const debugPort = isDesktop ? 9334 : 9335;

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=' + debugPort,
      '--no-first-run',
    ],
    headless: true,
  });

  try {
    // Give the browser a moment to open the port
    await new Promise(r => setTimeout(r, 500));

    const flags = {
      port: debugPort,
      hostname: 'localhost',
      output: 'json',
      logLevel: 'silent',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      disableStorageReset: false,
    };

    const config = isDesktop ? {
      extends: 'lighthouse:default',
      settings: {
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttlingMethod: 'simulate',
      },
    } : {
      extends: 'lighthouse:default',
      settings: {
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        throttlingMethod: 'simulate',
      },
    };

    const runnerResult = await lighthouse.default(URL_TO_AUDIT, flags, config);
    const { categories } = runnerResult.lhr;

    const scores = {
      performance: Math.round(categories.performance.score * 100),
      accessibility: Math.round(categories.accessibility.score * 100),
      'best-practices': Math.round(categories['best-practices'].score * 100),
      seo: Math.round(categories.seo.score * 100),
    };

    const outPath = '/tmp/lh-v5-' + mode + '.json';
    fs.writeFileSync(outPath, JSON.stringify(runnerResult.lhr, null, 2));
    console.log(mode.toUpperCase() + ' Lighthouse scores:');
    console.log('  Performance:    ', scores.performance);
    console.log('  Accessibility:  ', scores.accessibility);
    console.log('  Best Practices: ', scores['best-practices']);
    console.log('  SEO:            ', scores.seo);

  } finally {
    await browser.close();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
