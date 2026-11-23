// Lighthouse audit script that starts its own HTTP server
// Usage: node scripts/lighthouse-full.js

const lighthouse = require('/home/hatch/.npm/_npx/ba16b138af87a83e/node_modules/lighthouse');
const { chromium } = require('/home/hatch/.npm/_npx/705bc6b22212b352/node_modules/playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVE_DIR = path.resolve(__dirname, '../out_v5a');
const PORT = 8792;
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const URL_BASE = 'http://127.0.0.1:' + PORT;

// Minimal static file server
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let p = req.url.split('?')[0];
      if (p === '/' || p === '') p = '/dashboard/index.html';
      if (p.endsWith('/')) p += 'index.html';
      const full = path.join(SERVE_DIR, p);
      try {
        const data = fs.readFileSync(full);
        const ext = path.extname(full);
        const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      } catch (e) {
        res.writeHead(404); res.end('Not found: ' + p);
      }
    });
    srv.listen(PORT, '127.0.0.1', () => { console.log('Server on', PORT); resolve(srv); });
    srv.on('error', reject);
  });
}

async function runLH(url, label, desktopMode, debugPort) {
  const browser = await chromium.launchPersistentContext('/tmp/lh-pctx-' + debugPort + '-' + Date.now(), {
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=' + debugPort],
    headless: true,
  });
  await new Promise(r => setTimeout(r, 600));
  try {
    const cfg = {
      extends: 'lighthouse:default',
      settings: {
        formFactor: desktopMode ? 'desktop' : 'mobile',
        screenEmulation: desktopMode
          ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
          : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
        throttlingMethod: 'simulate',
      },
    };
    const result = await lighthouse.default(url, {
      port: debugPort,
      hostname: '127.0.0.1',
      output: 'json',
      logLevel: 'silent',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    }, cfg);
    const lhr = result.lhr;
    if (lhr.runtimeError) {
      console.error('[' + label + '] runtimeError:', lhr.runtimeError.code, lhr.runtimeError.message);
      return null;
    }
    const c = lhr.categories;
    const scores = {
      performance: Math.round(c.performance.score * 100),
      accessibility: Math.round(c.accessibility.score * 100),
      'best-practices': Math.round(c['best-practices'].score * 100),
      seo: Math.round(c.seo.score * 100),
    };
    fs.writeFileSync('/tmp/lh-v5-' + label.toLowerCase() + '.json', JSON.stringify(lhr, null, 2));
    console.log('[' + label + ']');
    console.log('  Performance:    ', scores.performance);
    console.log('  Accessibility:  ', scores.accessibility);
    console.log('  Best Practices: ', scores['best-practices']);
    console.log('  SEO:            ', scores.seo);
    return scores;
  } finally {
    await browser.close();
  }
}

async function main() {
  const srv = await startServer();
  const url = URL_BASE + '/dashboard/';
  try {
    const desktop = await runLH(url, 'DESKTOP', true, 9370);
    const mobile = await runLH(url, 'MOBILE', false, 9371);
    console.log('\nSummary:');
    if (desktop) console.log('  Desktop:', Object.entries(desktop).map(([k,v]) => k+'='+v).join(' '));
    if (mobile) console.log('  Mobile: ', Object.entries(mobile).map(([k,v]) => k+'='+v).join(' '));
  } finally {
    srv.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
