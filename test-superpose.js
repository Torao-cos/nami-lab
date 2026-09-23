// なみラボ ページD（superpose.html）自動検証
// 実行: node test-superpose.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8137;
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const f = path.join(ROOT, u === '/' ? 'superpose.html' : u.replace(/^\//, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(PORT);

  const OUT = path.join(ROOT, 'test-results');
  fs.mkdirSync(OUT, { recursive: true });
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), fullPage: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const base = `http://127.0.0.1:${PORT}/superpose.html`;
  const go = async (hash) => { await page.evaluate(h => { location.hash = h; }, '#' + hash); await page.waitForTimeout(500); };

  // --- 1. 初期表示（#superpose 直行） ---
  await page.goto(base + '#superpose');
  await page.waitForTimeout(900);
  check('タブが4つ', (await page.locator('nav.tabs button').count()) === 4);
  check('#superpose で9タブがアクティブ', (await page.locator('nav.tabs button.active').textContent()).includes('重ね合わせ'));
  await shot(page, 'sup-superpose-1280.png');
  check('D-9 初期表示でエラーなし', errors.length === 0, errors.join(' | '));

  // 「重なった瞬間で停止」
  await page.getByRole('button', { name: '重なった瞬間で停止' }).click();
  await page.waitForTimeout(300);
  const tstar = await page.locator('.readout').first().textContent();
  check('重なった瞬間で停止 → t* を計算', /t\* = 3\.50/.test(tstar), tstar);
  const paused = await page.evaluate(() => document.querySelector('.view.show .status').textContent);
  check('重なった瞬間で停止 → 停止状態', paused.includes('停止中'), paused);
  await shot(page, 'sup-superpose-overlap-1280.png');
  // 再開してクリック停止テスト
  await page.evaluate(() => document.querySelector('.view.show .timebar button').click()); // 再開
  await page.waitForTimeout(200);
  const box = await page.locator('.view.show canvas').first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => { const s = document.querySelector('.view.show .status'); return { t: s.textContent, h: s.hidden }; });
  check('キャンバスのクリックで停止表示', !st.h && st.t.includes('停止中'), JSON.stringify(st));
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(200);

  // --- 2. 反射タブ ---
  await go('reflect');
  check('#reflect でRタブがアクティブ', (await page.locator('nav.tabs button.active').textContent()).includes('反射'));
  check('反射タブはキャンバス2枚', (await page.locator('.view.show canvas').count()) === 2);
  await page.waitForTimeout(700);
  await shot(page, 'sup-reflect-1280.png');

  // 受け入れ基準6（連続 sin で確認）
  const acc6 = await page.evaluate(() => {
    const d = window.__nami_debug.reflect;
    d.setShape('c:sin');
    const A = d.A(), lam = d.lam(), v = d.v(), T = lam / v;
    let maxFixed = 0, maxFree = -1e9;
    for (let t = 0; t <= 4 * T; t += T / 2000) {
      maxFixed = Math.max(maxFixed, Math.abs(d.yWall('fixed', t)));
      maxFree = Math.max(maxFree, d.yWall('free', t));
    }
    return { A, T, maxFixed, maxFree };
  });
  check('基準6a 固定端の壁の変位が常に0', acc6.maxFixed < 1e-9, 'max|y(L)| = ' + acc6.maxFixed.toExponential(2));
  check('基準6b 自由端の壁の変位の最大が2A', Math.abs(acc6.maxFree - 2 * acc6.A) < 1e-4, `max y(L) = ${acc6.maxFree.toFixed(6)} / 2A = ${(2 * acc6.A).toFixed(3)}`);
  await page.waitForTimeout(400);
  await shot(page, 'sup-reflect-cont-1280.png');

  // パルスに戻して作図ステップ②
  await page.evaluate(() => window.__nami_debug.reflect.setShape('p:saw'));
  await page.evaluate(() => { const b = [...document.querySelectorAll('.view.show .controls button')].find(x => x.textContent.includes('② 反射波')); b.click(); });
  await page.evaluate(() => { const v = document.querySelector('.view.show'); v.querySelectorAll('.timebar input[type=range]')[0].value = 6.0; v.querySelectorAll('.timebar input[type=range]')[0].dispatchEvent(new Event('input')); });
  await page.waitForTimeout(400);
  const stepOn = await page.evaluate(() => [...document.querySelectorAll('.view.show .controls button')].filter(b => b.classList.contains('active')).map(b => b.textContent));
  check('作図ステップ②が選択状態', stepOn.some(s => s.includes('② 反射波')), stepOn.join(','));
  await shot(page, 'sup-reflect-step2-1280.png');

  // --- 3. 定在波タブ ---
  await go('standing');
  check('#standing で10タブがアクティブ', (await page.locator('nav.tabs button.active').textContent()).includes('定在波'));
  await page.waitForTimeout(700);
  await shot(page, 'sup-standing-1280.png');

  // 受け入れ基準5
  const acc5 = await page.evaluate(() => {
    const d = window.__nami_debug.standing;
    d.align();
    const xs = d.nodes();
    let maxMatched = 0;
    for (const x of xs) for (let t = 0; t <= 10; t += 0.005) maxMatched = Math.max(maxMatched, Math.abs(d.ySum(x, t)));
    const okMatch = d.matched();
    d.setA2(1.5);
    let maxDiff = 0;
    for (let t = 0; t <= 10; t += 0.005) maxDiff = Math.max(maxDiff, Math.abs(d.ySum(xs[0], t)));
    const okMatch2 = d.matched();
    d.align();
    return { maxMatched, maxDiff, okMatch, okMatch2, nodes: xs.length, first: xs[0] };
  });
  check('基準5a 一致時に節の変位が常に0', acc5.okMatch && acc5.maxMatched < 1e-6, `max|y| = ${acc5.maxMatched.toExponential(2)} (節${acc5.nodes}個, 第1節 x=${acc5.first})`);
  check('基準5b 振幅を変えると節の変位が0でなくなる', !acc5.okMatch2 && acc5.maxDiff > 0.1, `max|y| = ${acc5.maxDiff.toFixed(4)}`);

  // 不一致状態のスクショ
  await page.evaluate(() => window.__nami_debug.standing.setA2(1.5));
  await page.waitForTimeout(400);
  const roTxt = await page.evaluate(() => [...document.querySelectorAll('.view.show .readout')].map(e => e.textContent));
  check('不一致時に「定在波ではありません」表示', roTxt.some(s => s.includes('定在波ではありません')), roTxt.join(' / '));
  await shot(page, 'sup-standing-unmatched-1280.png');
  await page.evaluate(() => window.__nami_debug.standing.align());

  // 教材2
  await page.evaluate(() => { window.__nami_debug.standing.mode('m2'); window.__nami_debug.standing.setEnd('free'); });
  await page.waitForTimeout(500);
  await shot(page, 'sup-standing-m2-1280.png');
  const wall = await page.evaluate(() => {
    const d = window.__nami_debug.standing; d.setEnd('fixed');
    let m = 0; for (let t = 0; t <= 8; t += 0.002) m = Math.max(m, Math.abs(d.yWall2(t)));
    return m;
  });
  check('教材2 固定端で壁の変位が常に0', wall < 1e-9, 'max|y(L)| = ' + wall.toExponential(2));
  await page.evaluate(() => window.__nami_debug.standing.mode('m1'));

  // --- 4. 縦波の定在波タブ ---
  await go('ltstanding');
  check('#ltstanding で11タブがアクティブ', (await page.locator('nav.tabs button.active').textContent()).includes('縦波'));
  await page.waitForTimeout(700);
  await shot(page, 'sup-ltstanding-1280.png');
  const lt = await page.evaluate(() => {
    const d = window.__nami_debug.ltstanding, lam = d.lambda();
    let mNode = 0, mAnti = 0;
    for (let t = 0; t <= 6; t += 0.01) { mNode = Math.max(mNode, Math.abs(d.xi(lam / 2, t))); mAnti = Math.max(mAnti, Math.abs(d.xi(lam / 4, t))); }
    return { mNode, mAnti };
  });
  check('D-11 変位の節は常に0', lt.mNode < 1e-12, lt.mNode.toExponential(2));
  check('D-11 変位の腹は振動する', lt.mAnti > 0.1, lt.mAnti.toFixed(4));

  // --- 5. コマ送り・リセット・スクラブ ---
  await go('superpose');
  await page.evaluate(() => { const b = document.querySelector('.view.show .timebar button'); b.click(); }); // 停止
  const t0 = await page.evaluate(() => document.querySelector('.view.show .tval').textContent);
  await page.evaluate(() => { [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent === '▶').click(); });
  await page.waitForTimeout(200);
  const t1v = await page.evaluate(() => document.querySelector('.view.show .tval').textContent);
  check('コマ送り▶で時刻が進む', t0 !== t1v, `${t0} -> ${t1v}`);
  await page.evaluate(() => { [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent === '◀').click(); });
  await page.waitForTimeout(200);
  const t2v = await page.evaluate(() => document.querySelector('.view.show .tval').textContent);
  check('コマ送り◀で時刻が戻る', t2v === t0, `${t1v} -> ${t2v}`);
  await page.evaluate(() => { [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent === 'リセット').click(); });
  await page.waitForTimeout(200);
  check('リセットで t=0', (await page.evaluate(() => document.querySelector('.view.show .tval').textContent)).includes('0.00'));
  // 詳しくパネル
  await page.evaluate(() => document.querySelector('.view.show .detailBtn').click());
  await page.waitForTimeout(150);
  check('「詳しく」で開始位置スライダーが出る', await page.evaluate(() => { const d = document.querySelector('.view.show .controls.detail'); return !d.hidden && d.textContent.includes('開始位置'); }));

  // --- 6. 自由描画 ---
  await page.evaluate(() => { const b = [...document.querySelectorAll('.view.show .controls button')].find(x => x.textContent === '描く'); b.click(); });
  await page.waitForTimeout(200);
  const ov = await page.evaluate(() => document.querySelector('.view.show .overlay').textContent);
  check('「描く」で描画モードに入る', ov.includes('描画モード'), ov);
  const cb = await page.locator('.view.show canvas').first().boundingBox();
  await page.mouse.move(cb.x + 150, cb.y + cb.height * 0.55);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    const p = i / 20;
    await page.mouse.move(cb.x + 150 + p * 220, cb.y + cb.height * 0.55 - Math.sin(Math.PI * p) * 70 * (p < 0.5 ? 1 : 0.5));
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const drawn = await page.evaluate(() => {
    const o = document.querySelector('.view.show .overlay').textContent;
    const sel = document.querySelector('.view.show select');
    return { o, v: sel.value };
  });
  check('描画終了で描画モードを抜ける', drawn.o === '', JSON.stringify(drawn));
  check('自由描画がパルス波形として採用される', drawn.v === 'p:free', drawn.v);
  await page.evaluate(() => { const b = document.querySelector('.view.show .timebar button'); if (b.textContent.includes('再開')) b.click(); });
  await page.waitForTimeout(700);
  await shot(page, 'sup-superpose-free-1280.png');

  check('全操作後もコンソールエラーなし（PC）', errors.length === 0, errors.join(' | '));

  // --- 7. スマホ幅 ---
  const p2 = await ctx.newPage();
  const errors2 = [];
  p2.on('pageerror', e => errors2.push('pageerror: ' + e.message));
  p2.on('console', m => { if (m.type() === 'error') errors2.push('console: ' + m.text()); });
  await p2.setViewportSize({ width: 400, height: 900 });
  await p2.goto(base + '#reflect');
  await p2.waitForTimeout(1200);
  await p2.screenshot({ path: path.join(OUT, 'sup-reflect-400.png'), fullPage: true });
  const ov400 = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
  check('スマホ幅400で横スクロールなし', ov400.sw <= ov400.iw && ov400.bw <= ov400.iw, JSON.stringify(ov400));
  for (const h of ['superpose', 'standing', 'ltstanding']) {
    await p2.evaluate(x => { location.hash = '#' + x; }, h);
    await p2.waitForTimeout(600);
    const o = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(`スマホ幅400 #${h} 横スクロールなし`, o.sw <= o.iw, JSON.stringify(o));
  }
  await p2.evaluate(() => { location.hash = '#ltstanding'; });
  await p2.waitForTimeout(600);
  await p2.screenshot({ path: path.join(OUT, 'sup-ltstanding-400.png'), fullPage: true });
  check('スマホ幅でもコンソールエラーなし', errors2.length === 0, errors2.join(' | '));

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
