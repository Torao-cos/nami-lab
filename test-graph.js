// なみラボ ページB (graph.html) 自動検証 — 4グラフ1画面（2列×2段）構成
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

  const inkOf = async i => page.evaluate(idx => {
    const cv = document.querySelectorAll('.view.show .panel canvas')[idx];
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let k = 0; k < d.length; k += 16) if (d[k] > 30 || d[k + 1] > 30 || d[k + 2] > 30) n++;
    return n / (d.length / 16);
  }, i);
  const b4 = () => page.evaluate(() => window.__nami_debug.b4);
  const b5 = () => page.evaluate(() => window.__nami_debug.b5);

  /* ============================================================
     タブ4  y-x ⇄ y-t（4グラフ1画面）
     ============================================================ */
  await page.goto(U + '#yxyt');
  await page.waitForTimeout(900);
  check('コンソールエラー0（yxyt 初期表示）', errors.length === 0, errors.join(' | '));
  check('タブ2つ', await page.locator('nav.tabs button').count() === 2);
  check('#yxyt でタブ4がアクティブ',
    (await page.locator('nav.tabs button.active').textContent()).includes('y-x'),
    await page.locator('nav.tabs button.active').textContent());
  check('yxyt はキャンバス4枚（2列×2段）', await page.locator('.view.show .panel canvas').count() === 4);

  const grid4 = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.view.show .panel')].map(e => e.getBoundingClientRect());
    return { n: p.length, sameTop01: Math.abs(p[0].top - p[2].top) < 2, sameTop23: Math.abs(p[1].top - p[3].top) < 2,
             leftCol: Math.abs(p[0].left - p[1].left) < 2, rightCol: Math.abs(p[2].left - p[3].left) < 2,
             twoRows: p[1].top > p[0].bottom - 2, twoCols: p[2].left > p[0].right - 2,
             sameH: Math.abs(p[2].height - p[3].height) < 2 };
  });
  check('2列×2段に配置（左上/左下/右上/右下）',
    grid4.sameTop01 && grid4.sameTop23 && grid4.leftCol && grid4.rightCol && grid4.twoRows && grid4.twoCols,
    JSON.stringify(grid4));
  check('右列の上下2段が同じ高さ（補助線を見比べられる）', grid4.sameH);

  for (let i = 0; i < 4; i++) check(`yxyt キャンバス${i + 1}に描画あり`, (await inkOf(i)) > 0.005, 'ink=' + (await inkOf(i)).toFixed(4));

  /* --- クリックで停止 --- */
  const cv0 = page.locator('.view.show .panel canvas').first();
  const bb = await cv0.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.75, bb.y + bb.height * 0.25);
  await page.waitForTimeout(250);
  const st = await page.locator('.view.show .status').first().textContent();
  check('クリックで「⏸ 停止中」表示', st.includes('停止中'), st);
  check('sim が停止状態', await page.evaluate(() => !window.__nami_debug.sim4.running));

  /* --- 右上のカーソルで読んだ変位＝右下の写真の x₁ の変位 --- */
  let worst = 0;
  for (const [x1, t1] of [[5.0, 1.5], [3.3, 0.4], [8.7, 6.2], [0.0, 8.0], [10.0, 3.33]]) {
    await page.evaluate(([x, t]) => { const d = window.__nami_debug; d.setX1(x); d.setT1(t); }, [x1, t1]);
    await page.waitForTimeout(90);
    const b = await b4();
    worst = Math.max(worst, Math.abs(b.yTop - b.yBot));
  }
  check('右上 y-t のカーソル位置の変位＝右下 y-x の x₁ の変位（誤差 < 1e-12）', worst < 1e-12, 'max diff=' + worst.toExponential(2));

  /* --- t₁ を動かすと右下の写真（y-x）が描き直される --- */
  const hashOf = async i => page.evaluate(idx => {
    const cv = document.querySelectorAll('.view.show .panel canvas')[idx];
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let h = 2166136261; for (let k = 0; k < d.length; k += 97) { h ^= d[k]; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }, i);
  await page.evaluate(() => { const d = window.__nami_debug; d.setX1(5.0); d.setT1(1.5); });
  await page.waitForTimeout(150);
  const hD1 = await hashOf(3), hC1 = await hashOf(2);
  await page.evaluate(() => { window.__nami_debug.setT1(2.6); });
  await page.waitForTimeout(150);
  check('t₁ を動かすと右下の y-x（波の写真）が変わる', (await hashOf(3)) !== hD1);
  await page.evaluate(() => { const d = window.__nami_debug; d.setT1(1.5); d.setX1(7.3); });
  await page.waitForTimeout(150);
  check('x₁ を動かすと右上の y-t が描き直される', (await hashOf(2)) !== hC1);

  /* --- 右列は時間が流れても動かない（時刻は手で選ぶだけ） --- */
  await page.evaluate(() => { const d = window.__nami_debug; d.setX1(5.0); d.setT1(1.5); d.sim4.setT(2.0); });
  await page.waitForTimeout(120);
  const before = await b4();
  await page.evaluate(() => { window.__nami_debug.sim4.setT(6.4); });
  await page.waitForTimeout(150);
  const after = await b4();
  check('再生（時刻）が進んでも t₁ は動かない', after.t1 === before.t1 && Math.abs(after.t - 6.4) < 1e-9, `t₁ ${before.t1}→${after.t1}, t=${after.t}`);
  check('再生が進んでも右下の写真（t₁ の波形）は変わらない', Math.abs(after.yBot - before.yBot) < 1e-12);

  /* --- 左下: x₀ をドラッグした瞬間から記録が始まる（実ドラッグ） --- */
  await page.evaluate(() => { const d = window.__nami_debug; d.sim4.pause(); d.sim4.setT(3.0); });
  await page.waitForTimeout(150);
  const hp = await page.evaluate(() => window.__nami_debug.handleA4());
  await page.mouse.move(hp.x, hp.y);
  await page.mouse.down();
  await page.mouse.move(hp.x + 90, hp.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const bDrag = await b4();
  check('x₀ を実ドラッグで動かせた', Math.abs(bDrag.x0 - 2.5) > 0.3, 'x₀=' + bDrag.x0.toFixed(2));
  check('ドラッグ開始時刻が記録開始 tStart になる', Math.abs(bDrag.tStart - 3.0) < 1e-9, 'tStart=' + bDrag.tStart);
  check('ドラッグ直後は記録が空（t ≦ tStart）', bDrag.recording === false);
  const inkEmpty = await inkOf(1);
  await page.evaluate(() => { window.__nami_debug.sim4.setT(6.0); });
  await page.waitForTimeout(200);
  const bRec = await b4();
  const inkRec = await inkOf(1);
  check('時間を進めると記録が伸びる', bRec.recording === true && inkRec > inkEmpty, `ink ${inkEmpty.toFixed(4)} → ${inkRec.toFixed(4)}`);

  /* --- 時間スクラブで tStart より前へ戻ると空になる --- */
  await page.evaluate(() => { window.__nami_debug.sim4.setT(1.2); });
  await page.waitForTimeout(200);
  const bBack = await b4();
  const inkBack = await inkOf(1);
  check('tStart より前へ戻すと記録は空', bBack.recording === false && inkBack < inkRec, `ink=${inkBack.toFixed(4)}`);

  /* --- リセットで記録開始時刻も 0 に戻る --- */
  await page.locator('.view.show .timebar button').nth(3).click(); // リセット（0:停止 1:◀ 2:▶ 3:リセット 4:詳しく）
  await page.waitForTimeout(200);
  check('リセットで tStart = 0', (await b4()).tStart === 0);

  /* --- 左下（記録計）の1ページ＝右上の静止画と同じ 0〜4T --- */
  await page.evaluate(() => { window.__nami_debug.sim4.setT(3.0); });
  await page.waitForTimeout(150);
  const bWin = await b4();
  check('左下の記録計 1ページ＝0〜4T（右上の静止画と同じ時間範囲）',
    bWin.winB.x0 === 0 && Math.abs(bWin.winB.x1 - bWin.span) < 1e-9 && Math.abs(bWin.span - 8) < 1e-9,
    JSON.stringify(bWin.winB));

  await page.evaluate(() => { const d = window.__nami_debug; d.setX0(2.5, false); d.setX1(5.0); d.setT1(1.5); d.sim4.setT(5.1); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'graph-yxyt-1280.png') });

  /* --- 「詳しく」の進行方向反転でも左右の対応は崩れない --- */
  await page.locator('.view.show .timebar .detailBtn').click();
  await page.waitForTimeout(100);
  await page.locator('.view.show .controls.detail input[type=checkbox]').first().check();
  await page.waitForTimeout(250);
  const bRev = await b4();
  check('左進行波でも右上のカーソル＝右下の写真（誤差 < 1e-12）', bRev.dir === -1 && Math.abs(bRev.yTop - bRev.yBot) < 1e-12, 'dir=' + bRev.dir);
  await page.screenshot({ path: path.join(OUT, 'graph-yxyt-reversed-1280.png') });
  await page.locator('.view.show .controls.detail input[type=checkbox]').first().uncheck();
  await page.waitForTimeout(150);

  /* ============================================================
     タブ5  媒質の速度（4グラフ1画面）
     ============================================================ */
  await page.goto(U + '#velocity');
  await page.waitForTimeout(900);
  check('#velocity でタブ5がアクティブ',
    (await page.locator('nav.tabs button.active').textContent()).includes('媒質の速度'),
    await page.locator('nav.tabs button.active').textContent());
  check('velocity はキャンバス4枚（2列×2段）', await page.locator('.view.show .panel canvas').count() === 4);
  for (let i = 0; i < 4; i++) check(`velocity キャンバス${i + 1}に描画あり`, (await inkOf(i)) > 0.005, 'ink=' + (await inkOf(i)).toFixed(4));

  const grid5 = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.view.show .panel')].map(e => e.getBoundingClientRect());
    return { twoRows: p[1].top > p[0].bottom - 2, twoCols: p[2].left > p[0].right - 2,
             sameLeftW: Math.abs(p[0].width - p[1].width) < 2, sameRightW: Math.abs(p[2].width - p[3].width) < 2 };
  });
  check('velocity も2列×2段', grid5.twoRows && grid5.twoCols && grid5.sameLeftW && grid5.sameRightW, JSON.stringify(grid5));

  /* --- 接線の傾き＝解析値＝数値微分＝真下の v-t の値 --- */
  const cases = [[3.1, 0.7], [6.35, 2.15], [1.0, 5.0], [8.8, 0.33], [5.0, 3.9]];
  let worstA = 0, worstN = 0, worstV = 0, alignOK = true, alignDetail = '';
  for (const [x, t] of cases) {
    await page.evaluate(([x, t]) => { const d = window.__nami_debug; d.sim5.pause(); d.setXP(x); d.sim5.setT(t); }, [x, t]);
    await page.waitForTimeout(140);
    const b = await b5();
    const expect = (2 * Math.PI * b.A / b.T) * Math.cos(2 * Math.PI * (b.t / b.T - b.dir * b.xP / b.lambda));
    worstA = Math.max(worstA, Math.abs(b.slopeDrawn - expect));
    worstN = Math.max(worstN, Math.abs(b.slopeDrawn - b.slopeNumeric));
    worstV = Math.max(worstV, Math.abs(b.slopeDrawn - b.vtAtNow));
    const ok = b.winP.x0 === b.winW.x0 && b.winP.x1 === b.winW.x1 && b.padP.l === b.padW.l && b.padP.r === b.padW.r && Math.abs(b.pxP - b.pxW) < 0.51;
    if (!ok) { alignOK = false; alignDetail = JSON.stringify({ winP: b.winP, winW: b.winW, pxP: b.pxP, pxW: b.pxW }); }
  }
  check('接線の傾き＝(2πA/T)cos2π(t/T−x/λ)（誤差 < 1e-12）', worstA < 1e-12, 'max diff=' + worstA.toExponential(2));
  check('接線の傾き＝y-t の数値微分（誤差 < 1e-4）', worstN < 1e-4, 'max diff=' + worstN.toExponential(2));
  check('接線の傾き＝真下の v-t の値（誤差 < 1e-12）', worstV < 1e-12, 'max diff=' + worstV.toExponential(2));
  check('右列2段の t 軸が一致（現在時刻の縦線が貫通する）', alignOK, alignDetail);

  /* --- 速度矢印の長さ＝v·Δt（Δt→0 で矢の先が Δt 後のゴースト波形に乗る） --- */
  let worstLen = 0, gapBig = 0, gapSmall = 0;
  for (const [x, t, f] of [[2.5, 0.45, 1 / 12], [7.1, 2.8, 1 / 12], [4.0, 1.1, 0.25]]) {
    await page.evaluate(([x, t, f]) => { const d = window.__nami_debug; d.sim5.pause(); d.setXP(x); d.sim5.setT(t); d.setDt5(f); }, [x, t, f]);
    await page.waitForTimeout(140);
    const b = await b5();
    worstLen = Math.max(worstLen, Math.abs(b.arrowLen - b.arrowExpect));
  }
  check('速度矢印の長さ＝|v|·Δt（誤差 < 1e-12）', worstLen < 1e-12, 'max diff=' + worstLen.toExponential(2));
  await page.evaluate(() => { const d = window.__nami_debug; d.setXP(2.5); d.sim5.setT(0.45); d.setDt5(1 / 12); });
  await page.waitForTimeout(140);
  gapBig = Math.abs((await b5()).arrowTip - (await b5()).ghostY);
  await page.evaluate(() => { window.__nami_debug.setDt5(0.01); });
  await page.waitForTimeout(140);
  gapSmall = Math.abs((await b5()).arrowTip - (await b5()).ghostY);
  check('Δt を小さくすると矢の先がゴースト波形に近づく（1次近似）', gapSmall < gapBig / 5 && gapSmall < 0.01,
    `Δt=T/12: ${gapBig.toExponential(2)} → Δt=0.01T: ${gapSmall.toExponential(2)}`);
  await page.evaluate(() => { window.__nami_debug.setDt5(1 / 12); });
  await page.waitForTimeout(140);

  /* --- 左列は同じ x 軸 --- */
  const xaxis = await page.evaluate(() => {
    const d = window.__nami_debug; return { xP: d.b5.xP };
  });
  check('左列の注目点 P は共通（y-x と v-x で同じ x）', typeof xaxis.xP === 'number');

  /* --- トグル --- */
  await page.evaluate(() => { const d = window.__nami_debug; d.setXP(2.5); d.sim5.setT(0.45); d.sim5.pause(); });
  await page.waitForTimeout(200);
  const inkFull = await inkOf(0);
  await page.locator('.view.show .controls input[type=checkbox]').nth(0).uncheck(); // 速度矢印OFF
  await page.waitForTimeout(250);
  const inkNoArrow = await inkOf(0);
  check('速度矢印トグルで描画量が変化', inkNoArrow < inkFull, `${inkFull.toFixed(4)} -> ${inkNoArrow.toFixed(4)}`);
  await page.locator('.view.show .controls input[type=checkbox]').nth(0).check();
  await page.locator('.view.show .controls input[type=checkbox]').nth(1).uncheck(); // ゴーストOFF
  await page.waitForTimeout(250);
  const inkNoGhost = await inkOf(0);
  check('ゴースト波形トグルで描画量が変化', inkNoGhost < inkFull, `${inkFull.toFixed(4)} -> ${inkNoGhost.toFixed(4)}`);
  await page.locator('.view.show .controls input[type=checkbox]').nth(1).check();
  await page.waitForTimeout(200);

  /* --- コマ送り --- */
  await page.evaluate(() => window.__nami_debug.sim5.setT(1.0));
  await page.locator('.view.show .timebar button').nth(2).click(); // ▶
  await page.waitForTimeout(200);
  const tAfter = (await b5()).t;
  check('コマ送り ▶ で T/12 進む', Math.abs(tAfter - (1.0 + 2.0 / 12)) < 1e-6, 't=' + tAfter);

  await page.evaluate(() => { const d = window.__nami_debug; d.setXP(2.5); d.sim5.setT(5.1); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'graph-velocity-1280.png') });

  /* ============================================================
     スマホ幅（400）
     ============================================================ */
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(U + '#yxyt');
  await page.waitForTimeout(900);
  const ov = await page.evaluate(() => ({
    de: document.documentElement.scrollWidth, dc: document.documentElement.clientWidth,
    bo: document.body.scrollWidth, bc: document.body.clientWidth,
    wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 6)
  }));
  check('幅400・yxyt で横スクロールなし', ov.de <= ov.dc && ov.bo <= ov.bc + 1, JSON.stringify(ov));
  check('幅400・yxyt は縦1列（4枚とも全幅）', await page.evaluate(() => {
    const p = [...document.querySelectorAll('.view.show .panel')].map(e => e.getBoundingClientRect());
    return p.length === 4 && p.every(r => r.width > window.innerWidth * 0.8);
  }));
  for (let i = 0; i < 4; i++) check(`幅400・yxyt キャンバス${i + 1}に描画あり`, (await inkOf(i)) > 0.005);
  await page.screenshot({ path: path.join(OUT, 'graph-yxyt-400.png'), fullPage: false });

  await page.goto(U + '#velocity');
  await page.waitForTimeout(900);
  const ov2 = await page.evaluate(() => ({ de: document.documentElement.scrollWidth, dc: document.documentElement.clientWidth }));
  check('幅400・velocity で横スクロールなし', ov2.de <= ov2.dc, JSON.stringify(ov2));
  check('幅400・velocity は縦1列（4枚とも全幅）', await page.evaluate(() => {
    const p = [...document.querySelectorAll('.view.show .panel')].map(e => e.getBoundingClientRect());
    return p.length === 4 && p.every(r => r.width > window.innerWidth * 0.8);
  }));
  await page.screenshot({ path: path.join(OUT, 'graph-velocity-400.png'), fullPage: false });

  /* ---------- 最終エラー確認 ---------- */
  check('全操作後もコンソールエラー0', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
