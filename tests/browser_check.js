// Open the dashboard in Chromium (iPad Air 2 landscape viewport), report console
// errors, failed requests and what the board shows, and save a screenshot.
// Usage: node tests/browser_check.js [url] [screenshot.png]
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:8765/';
  const shot = process.argv[3] || 'screenshot.png';
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost' } : undefined;
  const browser = await chromium.launch({ proxy });
  const page = await browser.newPage({ viewport: { width: +(process.env.W || 1024), height: +(process.env.H || 768) }, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1' });
  // Serve the local project files directly (the sandbox proxy refuses plain-HTTP loopback).
  const path = require('path'), fs = require('fs'), root = path.join(__dirname, '..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  await page.route(u => u.hostname === 'localhost', route => {
    let p = new URL(route.request().url()).pathname; if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const errors = [], failed = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(0, 100)); });
  page.on('requestfailed', r => failed.push(r.url().slice(0, 90) + ' ' + (r.failure() || {}).errorText));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('feed-pill').dataset.state !== 'loading', null, { timeout: 30000 });
  await page.waitForTimeout(+(process.env.WAIT || 2500));
  const info = await page.evaluate(() => ({
    pill: document.getElementById('feed-pill').innerText,
    banner: document.getElementById('banner').hidden ? null : document.getElementById('banner').innerText,
    fresh: document.getElementById('fresh').innerText,
    weather: document.getElementById('weather').innerText.replace(/\n+/g, ' | '),
    C4: [...document.querySelectorAll('#line-C4 .deps > li')].map(l => l.innerText.replace(/\n+/g, ' ')),
    C6: [...document.querySelectorAll('#line-C6 .deps > li')].map(l => l.innerText.replace(/\n+/g, ' ')),
    overflowX: document.documentElement.scrollWidth > innerWidth,
    clipped: (b => b.scrollHeight + '/' + b.clientHeight)(document.querySelector('.board'))
  }));
  console.log(JSON.stringify(info, null, 1));
  console.log('console:', errors.length ? errors : 'none');
  console.log('failed requests:', failed.length ? failed : 'none');
  await page.screenshot({ path: shot });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
