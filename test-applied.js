// なみラボ ページE（applied.html）自動検証
// 実行: node test-applied.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8145;
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  }).listen(PORT);

  const OUT = path.join(ROOT, 'test-results');
  fs.mkdirSync(OUT, { recursive: true });
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const U = `http://127.0.0.1:${PORT}/applied.html`;
  const fps = () => page.evaluate(() => window.__nami_debug.fps);

  /* ---------- 1. 素元波 ---------- */
  await page.goto(U + '#huygens');
  await page.waitForTimeout(1500);
  check('#huygens に直行（タブが選択される）', await page.evaluate(() => document.querySelectorAll('nav.tabs button')[0].classList.contains('active')));
  check('タブ4つ', await page.locator('nav.tabs button').count() === 4);
  const fpsH = await fps();
  await shot(page, 'app-huygens-1280.png');
  check('素元波 fps', fpsH >= 30, fpsH + ' fps');
  // クリックで停止
  await page.mouse.click(200, 300);
  await page.waitForTimeout(300);
  const st1 = await page.evaluate(() => { const s = document.querySelector('.view.show .status'); return { t: s.textContent, hidden: s.hidden }; });
  check('キャンバスのクリックで停止表示', !st1.hidden && st1.t.includes('停止'), JSON.stringify(st1));
  const t1 = await page.evaluate(() => document.querySelector('.view.show .tval').textContent);
  await page.waitForTimeout(500);
  const t2 = await page.evaluate(() => document.querySelector('.view.show .tval').textContent);
  check('停止中は時間が止まる', t1 === t2, `${t1} / ${t2}`);
  await page.mouse.click(200, 300); // 再開
  await page.waitForTimeout(300);
  // 球面波に切替
  await page.selectOption('.view.show .controls select', 'sphere');
  await page.waitForTimeout(700);
  await shot(page, 'app-huygens-sphere-1280.png');
  // 時間スクラブ（過去へ戻れる）
  await page.mouse.click(200, 300);
  await page.waitForTimeout(200);
  const scrub = await page.evaluate(() => {
    const r = document.querySelector('.view.show .timebar input[type=range]');
    const before = parseFloat(r.value);
    r.value = 0.5; r.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, after: parseFloat(document.querySelector('.view.show .timebar input[type=range]').value) };
  });
  await page.waitForTimeout(200);
  check('時間スクラブで過去へ戻れる（素元波）', scrub.after < scrub.before, JSON.stringify(scrub));
  await page.mouse.click(200, 300);

  /* ---------- 2. 屈折 ---------- */
  await page.goto(U + '#refract');
  await page.waitForTimeout(1200);
  const fpsR = await fps();
  await shot(page, 'app-refract-1280.png');
  check('屈折 fps', fpsR >= 30, fpsR + ' fps');
  const readNums = () => page.evaluate(() => [...document.querySelectorAll('.view.show .formula b')].map(b => parseFloat(b.textContent)));
  const setSlider = (label, val) => page.evaluate(([label, val]) => {
    const ctl = [...document.querySelectorAll('.view.show .controls .ctl')].find(c => c.textContent.includes(label));
    const r = ctl.querySelector('input[type=range]'); r.value = val; r.dispatchEvent(new Event('input', { bubbles: true }));
  }, [label, val]);
  for (const [v1, v2, i] of [[1.5, 1.0, 50], [1.0, 2.0, 20], [0.8, 0.6, 70]]) {
    await setSlider('媒質1の速さ', v1); await setSlider('媒質2の速さ', v2); await setSlider('入射角', i);
    await page.waitForTimeout(250);
    const n = await readNums();
    const ok = n.length === 3 && Math.abs(n[0] - n[1]) < 0.02 && Math.abs(n[1] - n[2]) < 0.02 && Math.abs(n[1] - v1 / v2) < 0.02;
    check(`屈折の読み出し sin i/sin r = v₁/v₂ = λ₁/λ₂ (v1=${v1}, v2=${v2}, i=${i}°)`, ok, JSON.stringify(n) + ' vs v1/v2=' + (v1 / v2).toFixed(3));
  }
  // 全反射
  await setSlider('媒質1の速さ', 1.0); await setSlider('媒質2の速さ', 2.0); await setSlider('入射角', 70);
  await page.waitForTimeout(250);
  const totText = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('全反射条件で「屈折波なし（全反射）」', totText.includes('全反射'), totText.slice(0, 60));
  await setSlider('媒質1の速さ', 1.5); await setSlider('媒質2の速さ', 1.0); await setSlider('入射角', 50);
  await page.waitForTimeout(400);
  await shot(page, 'app-refract-1280.png');

  /* ---------- 3. 回折 ---------- */
  await page.goto(U + '#diffract');
  await page.waitForTimeout(5000);
  const fpsD = await fps();
  const probe = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-1280.png');
  check('回折 fps ≥ 30', fpsD >= 30, fpsD + ' fps / 格子 ' + probe.nx + '×' + probe.ny + ' / ' + probe.step + ' steps');
  check('波がスリットを通って裏側に届く', probe.behindAxis > 0.05 * probe.front, `front=${probe.front.toFixed(3)} behindAxis=${probe.behindAxis.toFixed(3)}`);
  check('障壁の裏の軸外へ回り込む（回折）', probe.behindOff > 0.02, `behindOff=${probe.behindOff.toFixed(3)}`);
  check('回折タブは時間スクラブなし', await page.evaluate(() => document.querySelector('.view.show .timebar input[type=range]') === null));
  // 狭いスリット（w≲λ）と広いスリット（w≫λ）の回り込み比較
  const setD = (label, val) => setSlider(label, val);
  await setD('スリット幅', 6); await setD('波長', 14);
  await page.waitForTimeout(4000);
  const narrow = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-narrow-1280.png');
  await setD('スリット幅', 56); await setD('波長', 6);
  await page.waitForTimeout(4000);
  const wide = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-wide-1280.png');
  const rn = narrow.behindOff / narrow.behindAxis, rw = wide.behindOff / wide.behindAxis;
  check('w≲λ の方が軸外へ回り込む割合が大きい', rn > rw, `narrow(w/λ=0.43)=${rn.toFixed(3)} > wide(w/λ=9.3)=${rw.toFixed(3)}`);
  // 二重スリット
  await page.selectOption('.view.show .controls select', 'double');
  await setD('スリット幅', 8); await setD('波長', 12);
  await page.waitForTimeout(4500);
  await shot(page, 'app-diffract-double-1280.png');
  // リセット
  await page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('リセット')).click());
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__nami_debug.probe());
  check('リセットで場がゼロクリアされる', after.step < 30 && after.front < 0.2, JSON.stringify({ step: after.step, front: +after.front.toFixed(3) }));
  await page.selectOption('.view.show .controls select', 'single');
  await setD('スリット幅', 24); await setD('波長', 12);

  /* ---------- 4. 干渉 ---------- */
  await page.goto(U + '#interfere');
  await page.waitForTimeout(1500);
  const fpsI = await fps();
  await shot(page, 'app-interfere-1280.png');
  check('干渉 fps ≥ 30', fpsI >= 30, fpsI + ' fps');
  // 強め合い線上（m=1: |r1-r2|=λ）へ P をドラッグ
  const target = await page.evaluate(() => {
    const d = window.__nami_debug, st = d.st, lam = st.lam, dd = st.d;
    const a = lam / 2, c = dd / 2, b = Math.sqrt(c * c - a * a), u = 1.0;
    const wx = a * Math.cosh(u), wy = b * Math.sinh(u);
    return { wx, wy, from: d.toPage(d.P.x, d.P.y), to: d.toPage(wx, wy) };
  });
  await page.mouse.move(target.from.x, target.from.y);
  await page.mouse.down();
  await page.mouse.move(target.to.x, target.to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const res = await page.evaluate(() => {
    const d = window.__nami_debug, st = d.st, S1 = { x: -st.d / 2, y: 0 }, S2 = { x: st.d / 2, y: 0 };
    const r1 = Math.hypot(d.P.x - S1.x, d.P.y - S1.y), r2 = Math.hypot(d.P.x - S2.x, d.P.y - S2.y);
    return { P: { x: d.P.x, y: d.P.y }, dr: Math.abs(r1 - r2), lam: st.lam, text: document.querySelector('.view.show .formula').textContent };
  });
  const q = res.dr / res.lam;
  check('P を強め合い線へドラッグ → 経路差 = 1.00λ', Math.abs(q - 1) < 0.04, `経路差 ${res.dr.toFixed(3)} m = ${q.toFixed(3)}λ / P=(${res.P.x.toFixed(2)}, ${res.P.y.toFixed(2)})`);
  check('読み出しが「強め合い」', res.text.includes('強め合い') && res.text.includes('1.00 λ'), res.text.slice(0, 120));
  // 弱め合い線（m=0.5）
  await page.evaluate(() => {
    const d = window.__nami_debug, st = d.st, lam = st.lam, dd = st.d;
    const a = 0.5 * lam / 2, c = dd / 2, b = Math.sqrt(c * c - a * a), u = 1.0;
    d.P.x = a * Math.cosh(u); d.P.y = b * Math.sinh(u);
  });
  await page.waitForTimeout(300);
  const res2 = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('弱め合い線上で「弱め合い」(0.50λ)', res2.includes('弱め合い') && res2.includes('0.50 λ'), res2.slice(0, 120));
  // 教科書の作図＋逆位相
  await page.evaluate(() => [...document.querySelectorAll('.view.show .controls label')].find(l => l.textContent.includes('教科書の作図')).querySelector('input').click());
  await page.waitForTimeout(600);
  await shot(page, 'app-interfere-circles-1280.png');
  await page.selectOption('.view.show .controls select', 'pi');
  await page.waitForTimeout(400);
  const res3 = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('逆位相にすると同じ点が「強め合い」に入れ替わる', res3.includes('強め合い'), res3.slice(0, 120));
  await page.selectOption('.view.show .controls select', '0');

  /* ---------- 5. スマホ幅 ---------- */
  const page2 = await ctx.newPage();
  const errors2 = [];
  page2.on('pageerror', e => errors2.push('pageerror: ' + e.message));
  page2.on('console', m => { if (m.type() === 'error') errors2.push('console: ' + m.text()); });
  await page2.setViewportSize({ width: 400, height: 900 });
  await page2.goto(U + '#diffract');
  await page2.waitForTimeout(4000);
  await shot(page2, 'app-diffract-400.png');
  const hscroll = await page2.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('幅400pxで横スクロールなし', !hscroll);
  const fpsM = await page2.evaluate(() => window.__nami_debug.fps);
  check('スマホ幅 回折 fps ≥ 30', fpsM >= 30, fpsM + ' fps');
  for (const id of ['huygens', 'refract', 'interfere']) {
    await page2.goto(U + '#' + id);
    await page2.waitForTimeout(900);
    await shot(page2, 'app-' + id + '-400.png');
  }
  check('スマホ幅でもエラーなし', errors2.length === 0, errors2.join(' | '));

  check('全操作後もコンソールエラー0', errors.length === 0, errors.join(' | '));
  console.log('\nfps: huygens=' + fpsH + ' refract=' + fpsR + ' diffract=' + fpsD + ' interfere=' + fpsI + ' mobile-diffract=' + fpsM);

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
