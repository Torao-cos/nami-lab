// なみラボ 検証用: 静的サーバ＋headless Chromium でページを開き、コンソールエラーを収集してスクショ保存
// 使い方: node tools/shot.js <page.html#tab> <out.png> [width] [height] [waitMs] [clickCanvas]
'use strict';
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const [target, out, W = '1280', H = '800', WAIT = '1500', CLICK = ''] = process.argv.slice(2);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(fs.readFileSync(p));
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/${target}`); await page.waitForTimeout(+WAIT);
  if (CLICK) { await page.click('canvas'); await page.waitForTimeout(300); }
  const status = await page.evaluate(() => [...document.querySelectorAll('.status')].filter(s => !s.hidden).map(s => s.textContent));
  const scrollX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: out, fullPage: false });
  console.log(JSON.stringify({ target, out, errors, status, horizontalOverflow: scrollX }));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
