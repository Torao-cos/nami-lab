// なみラボ ページB (graph.html) 自動検証
// 実行: node test-graph.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8126;
const ROOT = __dirname;
const OUT = path.join(ROOT, 'test-results');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  }).listen(PORT);
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const U = `http://127.0.0.1:${PORT}/graph.html`;

  /* ---------- 1. #yxyt 直行 ---------- */
  await page.goto(U + '#yxyt');
  await page.waitForTimeout(900);
  check('コンソールエラー0（yxyt 初期表示）', errors.length === 0, errors.join(' | '));
  check('タブ2つ', await page.locator('nav.tabs button').count() === 2);
  check('#yxyt でタブ4がアクティブ',
    (await page.locator('nav.tabs button.active').textContent()).includes('y-x'),
    await page.locator('nav.tabs button.active').textContent());
  check('yxyt はキャンバス2枚', await page.locator('.view.show .panel canvas').count() === 2);

  /* ---------- 2. 描画されているか（非真っ黒判定） ---------- */
  const inkOf = async i => page.evaluate(idx => {
    const cv = document.querySelectorAll('.view.show .panel canvas')[idx];
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let k = 0; k < d.length; k += 16) if (d[k] > 30 || d[k + 1] > 30 || d[k + 2] > 30) n++;
    return n / (d.length / 16);
  }, i);
  check('y-x キャンバスに描画あり', (await inkOf(0)) > 0.005, 'ink=' + (await inkOf(0)).toFixed(4));
  check('y-t キャンバスに描画あり', (await inkOf(1)) > 0.005, 'ink=' + (await inkOf(1)).toFixed(4));

  /* ---------- 3. キャンバスクリックで停止 ---------- */
  const cv0 = page.locator('.view.show .panel canvas').first();
  const bb = await cv0.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.72, bb.y + bb.height * 0.5);
  await page.waitForTimeout(250);
  const st = await page.locator('.view.show .status').first().textContent();
  check('クリックで「⏸ 停止中」表示', st.includes('停止中'), st);
  const paused = await page.evaluate(() => !window.__nami_debug.sim4.running);
  check('sim が停止状態', paused);

  /* ---------- 4. カット線3本＋重ね合わせの一致（B-4 の主張） ---------- */
  await page.evaluate(() => {
    const d = window.__nami_debug;
    d.setCutCount(3); d.setCut(0, 2.2); d.setCut(1, 5.0); d.setCut(2, 7.7);
    d.setOverlay4(true); d.sim4.setT(3.4);
  });
  await page.waitForTimeout(250);
  let b4 = await page.evaluate(() => window.__nami_debug.b4);
  check('カット線3本・位置が反映', b4.n === 3 && Math.abs(b4.cuts[0] - 2.2) < 1e-9, JSON.stringify(b4.cuts));
  check('右進行: 反転重ねが y-t と一致（max誤差 < 1e-12）', b4.overlayMaxErr < 1e-12, 'err=' + b4.overlayMaxErr.toExponential(2));
  check('停止中もカット移動が即反映（t 固定）', Math.abs(b4.t - 3.4) < 1e-9, 't=' + b4.t);
  await page.screenshot({ path: path.join(OUT, 'graph-yxyt-1280.png') });

  /* ---------- 4b. 左進行波でも一致 ---------- */
  await page.locator('.view.show .timebar .detailBtn').click();
  await page.waitForTimeout(100);
  await page.locator('.view.show .controls.detail input[type=checkbox]').first().check();
  await page.waitForTimeout(250);
  b4 = await page.evaluate(() => window.__nami_debug.b4);
  check('左進行: 反転重ねが y-t と一致', b4.dir === -1 && b4.overlayMaxErr < 1e-12, 'dir=' + b4.dir + ' err=' + b4.overlayMaxErr.toExponential(2));
  await page.locator('.view.show .controls.detail input[type=checkbox]').first().uncheck();
  await page.waitForTimeout(150);

  /* ---------- 5. #velocity 直行 ---------- */
  await page.goto(U + '#velocity');
  await page.waitForTimeout(900);
  check('#velocity でタブ5がアクティブ',
    (await page.locator('nav.tabs button.active').textContent()).includes('媒質の速度'),
    await page.locator('nav.tabs button.active').textContent());
  check('velocity はキャンバス3枚', await page.locator('.view.show .panel canvas').count() === 3);
  for (let i = 0; i < 3; i++) check(`velocity キャンバス${i + 1}に描画あり`, (await inkOf(i)) > 0.005, 'ink=' + (await inkOf(i)).toFixed(4));

  /* ---------- 6. 接線の傾き＝解析値 ---------- */
  const cases = [[3.1, 0.7], [6.35, 2.15], [1.0, 5.0], [8.8, 0.33]];
  let worstA = 0, worstN = 0;
  for (const [x, t] of cases) {
    await page.evaluate(([x, t]) => { const d = window.__nami_debug; d.sim5.pause(); d.setXP(x); d.sim5.setT(t); }, [x, t]);
    await page.waitForTimeout(140);
    const b5 = await page.evaluate(() => window.__nami_debug.b5);
    const expect = (2 * Math.PI * b5.A / b5.T) * Math.cos(2 * Math.PI * (b5.t / b5.T - b5.dir * b5.xP / b5.lambda));
    worstA = Math.max(worstA, Math.abs(b5.slopeDrawn - expect));
    worstN = Math.max(worstN, Math.abs(b5.slopeDrawn - b5.slopeNumeric));
  }
  check('接線の傾き＝(2πA/T)cos2π(t/T−x/λ)（誤差 < 1e-12）', worstA < 1e-12, 'max diff=' + worstA.toExponential(2));
  check('接線の傾き＝y-t の数値微分（誤差 < 1e-4）', worstN < 1e-4, 'max diff=' + worstN.toExponential(2));

  /* ---------- 7. トグル動作 ---------- */
  await page.evaluate(() => { const d = window.__nami_debug; d.setXP(2.5); d.sim5.setT(0.45); d.sim5.pause(); });
  await page.waitForTimeout(200);
  const inkFull = await inkOf(0);
  await page.locator('.view.show .controls input[type=checkbox]').nth(0).uncheck(); // 速度矢印OFF
  await page.waitForTimeout(250);
  const inkNoArrow = await inkOf(0);
  check('速度矢印トグルで描画量が変化', inkNoArrow < inkFull, `${inkFull.toFixed(4)} -> ${inkNoArrow.toFixed(4)}`);
  await page.locator('.view.show .controls input[type=checkbox]').nth(0).check();
  await page.locator('.view.show .controls input[type=checkbox]').nth(2).uncheck(); // v-xグラフOFF
  await page.waitForTimeout(250);
  check('v-x トグルでパネルが隠れる', await page.locator('.view.show .panel canvas').nth(1).isVisible() === false);
  await page.locator('.view.show .controls input[type=checkbox]').nth(2).check();
  await page.waitForTimeout(250);

  /* ---------- 8. コマ送り・リセット ---------- */
  await page.evaluate(() => window.__nami_debug.sim5.setT(1.0));
  await page.locator('.view.show .timebar button').nth(2).click(); // ▶ コマ送り
  await page.waitForTimeout(200);
  const tAfter = await page.evaluate(() => window.__nami_debug.b5.t);
  check('コマ送り ▶ で T/12 進む', Math.abs(tAfter - (1.0 + 2.0 / 12)) < 1e-6, 't=' + tAfter);

  await page.screenshot({ path: path.join(OUT, 'graph-velocity-1280.png') });

  /* ---------- 9. スマホ幅 ---------- */
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(U + '#yxyt');
  await page.waitForTimeout(900);
  const ov = await page.evaluate(() => ({
    de: document.documentElement.scrollWidth, dc: document.documentElement.clientWidth,
    bo: document.body.scrollWidth, bc: document.body.clientWidth,
    wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 6)
  }));
  check('幅400で横スクロールなし', ov.de <= ov.dc && ov.bo <= ov.bc + 1, JSON.stringify(ov));
  check('スマホ幅でも描画あり', (await inkOf(0)) > 0.005);
  await page.screenshot({ path: path.join(OUT, 'graph-yxyt-400.png'), fullPage: false });

  await page.goto(U + '#velocity');
  await page.waitForTimeout(900);
  const ov2 = await page.evaluate(() => ({ de: document.documentElement.scrollWidth, dc: document.documentElement.clientWidth }));
  check('幅400・velocity で横スクロールなし', ov2.de <= ov2.dc, JSON.stringify(ov2));
  check('幅400・velocity は縦1列', await page.evaluate(() => {
    const p = [...document.querySelectorAll('.view.show .panel')].map(e => e.getBoundingClientRect());
    return p.every(r => r.width > window.innerWidth * 0.8);
  }));
  await page.screenshot({ path: path.join(OUT, 'graph-velocity-400.png'), fullPage: false });

  /* ---------- 10. 最終エラー確認 ---------- */
  check('全操作後もコンソールエラー0', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
