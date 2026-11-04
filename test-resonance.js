// なみラボ sound.html「21〜24 弦の振動と気柱の共鳴」自動検証（旧 おとラボ resonance.html から移植）
// 実行: node test-resonance.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8173;
const ROOT = path.resolve(__dirname, '..');   // D:/claude_projects
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const OUT = path.join(__dirname, 'test-results');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const TABS = ['string', 'drive', 'pipe', 'tube'];

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const f = path.join(ROOT, u.replace(/^\//, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(PORT);
  const base = `http://127.0.0.1:${PORT}/nami-lab/sound.html`;
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

  /* ---------- 1. 全タブ × 手元/投影 × 2サイズ：エラー0・横スクロールなし・スクショ ---------- */
  for (const mode of ['dark', 'proj']) {
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      await page.goto(`${base}?mode=${mode}#string`);
      await page.waitForTimeout(700);
      for (const tab of TABS) {
        await page.evaluate(h => { location.hash = h; }, '#' + tab);
        await page.waitForTimeout(650);
        if (tab === 'tube') { // 管A=1回目・管B=2回目の共鳴に置いた状態で撮る
          await page.evaluate(() => { const d = __oto_debug.tube; d.setL('A', d.lam() / 4 - d.dX()); d.setL('B', 3 * d.lam() / 4 - d.dX()); d.mark('A'); d.setL('B', 30); d.setL('B', 3 * d.lam() / 4 - d.dX()); d.mark('B'); });
          await page.waitForTimeout(300);
        }
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, act: document.querySelector('nav.tabs button.active').textContent }));
        check(`[${mode} ${w}] #${tab} 横スクロールなし`, o.sw <= o.iw, `${o.sw}/${o.iw} active=${o.act}`);
        await page.screenshot({ path: path.join(OUT, `resonance-${tab}-${mode}-${w}.png`), fullPage: true });
      }
      check(`[${mode} ${w}] 全タブでエラーなし`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }

  /* ---------- 2. 操作と数値 ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`${base}?mode=dark#string`);
  await page.waitForTimeout(700);
  check('タブが5つ（20〜24）', (await page.locator('nav.tabs button').count()) === 5);
  const formula = () => page.evaluate(() => document.querySelector('.view.show .controls .formula').textContent);
  const frames = () => page.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))));
  const dragPx = async (cb, X0, Y0, X1, Y1) => {
    await page.mouse.move(cb.x + X0, cb.y + Y0); await page.mouse.down();
    for (let i = 1; i <= 14; i++) await page.mouse.move(cb.x + X0 + (X1 - X0) * i / 14, cb.y + Y0 + (Y1 - Y0) * i / 14);
    await page.mouse.up(); await page.waitForTimeout(150);
  };

  // --- タブ1 ---
  let r = await page.evaluate(() => { const d = __oto_debug.string; d.setL(0.6); d.setV(120); d.setN(2); return d.calc(); });
  check('弦 2倍振動 L=0.60 v=120 → λ=0.60 m, f=200 Hz', near(r.lam, 0.6, 1e-9) && near(r.f, 200, 1e-9), JSON.stringify(r));
  await page.waitForTimeout(100);
  let ft = await formula();
  check('弦 読み出しに数値代入（200.0 Hz）', ft.includes('2 × 0.60 m / 2') && ft.includes('200.0 Hz'), ft);
  r = await page.evaluate(() => { const d = __oto_debug.string; d.setN(3); d.setL(0.9); d.setV(150); const c = d.calc(); let m = 0; for (let t = 0; t < 3; t += 0.01) m = Math.max(m, Math.abs(d.y(0, t)), Math.abs(d.y(c.L, t)), Math.abs(d.y(c.L / 3, t))); return { c, m }; });
  check('弦 3倍振動 L=0.90 v=150 → f=250 Hz', near(r.c.f, 250, 1e-9), r.c.f);
  check('弦 両端と節（x=L/3）で変位が常に0', r.m < 1e-9, r.m.toExponential(2));
  // 長さスライダーをマウスでドラッグ
  const sliderDrag = async (idx, fromFrac, toFrac) => {
    const box = await page.locator('.view.show .controls input[type=range]').nth(idx).boundingBox();
    await page.mouse.move(box.x + box.width * fromFrac, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (fromFrac + (toFrac - fromFrac) * i / 10), box.y + box.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const L0 = (await page.evaluate(() => __oto_debug.string.calc().L));
  await sliderDrag(0, 0.2, 0.9);
  const L1 = (await page.evaluate(() => __oto_debug.string.calc().L));
  check('弦 L スライダーをマウスでドラッグ → L が変わる', L1 > L0 + 0.1, `${L0} → ${L1}`);
  // L を変えると右端の固定具の画面上の位置が変わる（目盛り＝x=0 の位置は固定）
  {
    await page.evaluate(() => __oto_debug.string.setL(0.40)); await frames();
    const a = await page.evaluate(() => ({ X: __oto_debug.string.fixturePx(), O: __oto_debug.string.originPx() }));
    await page.evaluate(() => __oto_debug.string.setL(1.10)); await frames();
    const b = await page.evaluate(() => ({ X: __oto_debug.string.fixturePx(), O: __oto_debug.string.originPx() }));
    check('弦 L=0.40→1.10 で右端の固定具の x 座標が右へ動く（x=0 の位置・目盛りは固定）', b.X > a.X + 300 && Math.abs(a.O - b.O) < 0.5, JSON.stringify({ a, b }));
    await page.screenshot({ path: path.join(OUT, 'resonance-string-L110.png') });
    // 固定具をマウスでドラッグして L を変える
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
    const cb = await page.locator('.view.show canvas').first().boundingBox();
    const P = await page.evaluate(() => { const d = __oto_debug.string; return { X: d.fixturePx(), Y: d.canvas.py(0), Xt: d.canvas.px(0.5) }; });
    await dragPx(cb, P.X, P.Y, P.Xt, P.Y);
    const Ld = await page.evaluate(() => __oto_debug.string.calc().L);
    const sv = await page.evaluate(() => document.querySelector('.view.show .controls input[type=range]').value);
    check('弦 右端の固定具をドラッグ → L が変わりスライダーも連動', near(Ld, 0.5, 0.02) && near(+sv, Ld, 1e-9), `L=${Ld} slider=${sv}`);
    check('弦 固定具のドラッグでは停止しない', await page.evaluate(() => document.querySelector('.view.show .status').hidden));
  }
  await page.evaluate(() => { const d = __oto_debug.string; d.setL(0.30); d.setN(6); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'resonance-string-L030-n6.png') });
  await page.evaluate(() => { const d = __oto_debug.string; d.setN(1); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'resonance-string-L030-n1.png') });
  await page.evaluate(() => { const d = __oto_debug.string; d.setL(0.9); d.setN(3); });
  // 進行波トグル
  await page.locator('.view.show label', { hasText: '左右に進む波を表示' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'resonance-string-traveling.png') });
  // 音（トグル→停止ボタン）
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.waitForTimeout(200);
  const on1 = await page.evaluate(() => __oto_debug.string.sound.voice.on);
  await page.locator('.view.show button.stopSnd').click();
  await page.waitForTimeout(100);
  const on2 = await page.evaluate(() => ({ v: __oto_debug.string.sound.voice.on, c: __oto_debug.string.sound.toggle.get() }));
  check('音トグルで鳴り、停止ボタンで止まる', on1 === true && on2.v === false && on2.c === false, JSON.stringify({ on1, on2 }));
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.waitForTimeout(100);
  await page.evaluate(() => { location.hash = '#pipe'; });
  await page.waitForTimeout(300);
  check('タブ切替で音が止まる', await page.evaluate(() => !__oto_debug.string.sound.voice.on));

  // --- タブ2 ---
  await page.evaluate(() => { location.hash = '#drive'; });
  await page.waitForTimeout(500);
  r = await page.evaluate(() => {
    const d = __oto_debug.drive, f1 = d.f1();
    const peaks = [1, 2, 3, 4, 5, 6].map(n => d.amp(n * f1));
    const mids = [1, 2, 3, 4, 5].map(n => d.amp((n + 0.5) * f1));
    const local = [1, 2, 3].every(n => d.amp(n * f1) > d.amp(n * f1 * 0.98) && d.amp(n * f1) > d.amp(n * f1 * 1.02));
    const Y = d.shape(170); const y0 = Y(0), yL = Y(0.6);
    return { f1, peaks, mids, local, y0, yL, fMax: d.fMax() };
  });
  check('振動子 既定 f₁ = v/(2L) = 100 Hz', near(r.f1, 100, 1e-9), r.f1);
  check('振動子 固有振動数で振幅が大きい（≒20倍）', r.peaks.every(p => p > 15 && p < 25), r.peaks.map(p => p.toFixed(2)).join(','));
  check('振動子 固有振動数の間では小さい（<2倍）', r.mids.every(p => p < 2), r.mids.map(p => p.toFixed(2)).join(','));
  check('振動子 固有振動数の近くが局所最大', r.local);
  check('振動子 境界条件 Y(0)=1, Y(L)=0', near(r.y0[0], 1, 1e-9) && near(r.y0[1], 0, 1e-9) && Math.hypot(...r.yL) < 1e-9, JSON.stringify(r));
  const c0 = await page.evaluate(() => __oto_debug.drive.recCount());
  const fA = await page.evaluate(() => __oto_debug.drive.getF());
  await sliderDrag(2, 0.08, 0.5);
  const fB = await page.evaluate(() => __oto_debug.drive.getF());
  const c1 = await page.evaluate(() => __oto_debug.drive.recCount());
  check('振動子 f スライダーをマウスでドラッグ → f が変わる', fB > fA + 100, `${fA} → ${fB}`);
  check('振動子 動かした範囲がグラフに記録される', c1 > c0 + 500, `${c0} → ${c1}`);
  ft = await formula();
  check('振動子 読み出し（λ = v/f に数値代入）', ft.includes('λ = v/f = 120 m/s /'), ft);
  await page.locator('.view.show button', { hasText: '+10' }).click();
  await page.waitForTimeout(100);
  const fC = await page.evaluate(() => __oto_debug.drive.getF());
  check('振動子 微調整 +10 Hz', near(fC, fB + 10, 0.11), `${fB} → ${fC}`);
  await page.locator('.view.show button', { hasText: '自動で掃引' }).click();
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(() => ({ s: __oto_debug.drive.sweeping(), f: __oto_debug.drive.getF() }));
  check('振動子 自動で掃引で f が増える', sw.s && sw.f > fC + 10, JSON.stringify(sw));
  await page.locator('.view.show button', { hasText: '掃引を止める' }).click();
  await page.evaluate(() => { const d = __oto_debug.drive; d.setF(0); for (let f = 0; f <= 400; f += 2) d.setF(f); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'resonance-drive-recorded.png') });
  await page.locator('.view.show button', { hasText: 'グラフを消す' }).click();
  check('振動子 グラフを消す', (await page.evaluate(() => __oto_debug.drive.recCount())) === 1);
  // 音（振動子の振動数 f・弦の振幅に比例）
  const sndState = () => page.evaluate(() => { const s = __oto_debug.drive.sound; return { on: s.voice.on, c: s.toggle.get(), f: s.voice.lastF, lv: s.voice.lastL, warn: !s.warn.hidden, txt: s.warn.textContent }; });
  check('振動子 音は既定 OFF', !(await sndState()).on && !(await sndState()).c);
  await page.evaluate(() => __oto_debug.drive.setF(150));
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.waitForTimeout(200);
  r = await sndState();
  check('振動子 音トグル ON → 振動子の f で鳴る', r.on && near(r.f, 150, 1e-6), JSON.stringify(r));
  const lvOff = r.lv;
  await page.evaluate(() => __oto_debug.drive.setF(100));
  await page.waitForTimeout(200);
  r = await sndState();
  check('振動子 共振（f₁=100 Hz）で音量が大きい（振幅に比例）', r.lv > lvOff * 8 && near(r.f, 100, 1e-6), `150Hz:${lvOff.toFixed(4)} 100Hz:${r.lv.toFixed(4)}`);
  check('振動子 音量既定 20%・共振で 0.25×0.20', near(r.lv, 0.25 * 0.2 * Math.min(1, (await page.evaluate(() => __oto_debug.drive.amp(100) / __oto_debug.drive.Q))), 1e-6), r.lv);
  await page.evaluate(() => __oto_debug.drive.setF(10));
  await page.waitForTimeout(200);
  r = await sndState();
  check('振動子 f=10 Hz（可聴域外）は音を出さずにその旨を表示', r.lv === 0 && r.warn && r.txt.includes('20'), JSON.stringify(r));
  await page.evaluate(() => __oto_debug.drive.setF(100));
  await page.waitForTimeout(100);
  check('振動子 可聴域に戻ると注記が消える', !(await sndState()).warn);
  await page.locator('.view.show button.stopSnd').click();
  await page.waitForTimeout(100);
  r = await sndState();
  check('振動子 「■ 音を止める」で止まりトグルも OFF', !r.on && !r.c, JSON.stringify(r));
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.waitForTimeout(100);
  check('振動子 音トグル再 ON', (await sndState()).on);
  await page.evaluate(() => { location.hash = '#string'; });
  await page.waitForTimeout(250);
  r = await sndState();
  check('振動子 タブ切替で音が止まる', !r.on && !r.c, JSON.stringify(r));
  await page.evaluate(() => { location.hash = '#drive'; });
  await page.waitForTimeout(300);
  // 掃引中に音量が応答に追随する
  await page.evaluate(() => __oto_debug.drive.setF(60));
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.locator('.view.show button', { hasText: '自動で掃引' }).click();
  const lvs = [];
  for (let i = 0; i < 16; i++) { await page.waitForTimeout(120); lvs.push(await page.evaluate(() => [__oto_debug.drive.getF(), __oto_debug.drive.sound.voice.lastL])); }
  await page.locator('.view.show button', { hasText: '掃引を止める' }).click();
  await page.locator('.view.show button.stopSnd').click();
  const lvMax = Math.max(...lvs.map(p => p[1])), lvMin = Math.min(...lvs.map(p => p[1]));
  check('振動子 掃引中に音量が応答に追随（共振の近くで大きい）', lvMax > lvMin * 4, lvs.map(p => p[0].toFixed(0) + ':' + p[1].toFixed(3)).join(' '));
  // L を変えると滑車が動く
  {
    await page.evaluate(() => __oto_debug.drive.setL(0.40)); await frames();
    const a = await page.evaluate(() => ({ X: __oto_debug.drive.pulleyPx().X, O: __oto_debug.drive.originPx() }));
    await page.evaluate(() => __oto_debug.drive.setL(1.10)); await frames();
    const b = await page.evaluate(() => ({ X: __oto_debug.drive.pulleyPx().X, O: __oto_debug.drive.originPx() }));
    check('振動子 L=0.40→1.10 で滑車の x 座標が右へ動く（x=0 の位置・目盛りは固定）', b.X > a.X + 300 && Math.abs(a.O - b.O) < 0.5, JSON.stringify({ a, b }));
    await page.screenshot({ path: path.join(OUT, 'resonance-drive-L110.png') });
    // 滑車をドラッグ → L が変わる
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
    const cb = await page.locator('.view.show canvas').first().boundingBox();
    const P = await page.evaluate(() => __oto_debug.drive.pulleyPx());
    const X50 = b.O + (b.X - b.O) * 0.5 / 1.10;
    await dragPx(cb, P.X, P.Y, X50, P.Y);
    const Ld = await page.evaluate(() => __oto_debug.drive.getL());
    const sv = await page.evaluate(() => document.querySelector('.view.show .controls input[type=range]').value);
    check('振動子 滑車をドラッグ → L が変わりスライダーも連動', near(Ld, 0.5, 0.02) && near(+sv, Ld, 1e-9), `L=${Ld} slider=${sv}`);
    check('振動子 ドラッグ後 f₁ = v/(2L)', near(await page.evaluate(() => __oto_debug.drive.f1()), 120 / (2 * Ld), 1e-6));
    check('振動子 滑車のドラッグでは停止しない', await page.evaluate(() => document.querySelector('.view.show .status').hidden));
    // v を変えるとおもり（張力 S ∝ v²）の描画サイズが変わる：立方体の体積 ∝ v²
    const wAt = async v => { await page.evaluate(x => __oto_debug.drive.setV(x), v); await frames(); return page.evaluate(() => __oto_debug.drive.weightPx().side); };
    const w60 = await wAt(60), w120 = await wAt(120), w240 = await wAt(240), w50 = await wAt(50), w300 = await wAt(300);
    check('振動子 v を 2 倍 → おもりの体積（辺³）が 4 倍（S ∝ v²）', near(Math.pow(w120 / w60, 3), 4, 1e-6) && near(Math.pow(w240 / w120, 3), 4, 1e-6), [w60, w120, w240].map(x => x.toFixed(2)).join(','));
    check('振動子 おもりの辺が v の最小〜最大で極端にならない', w50 > 7 && w300 < 60, `${w50.toFixed(1)}〜${w300.toFixed(1)} px`);
    await page.screenshot({ path: path.join(OUT, 'resonance-drive-v300.png') });
    // おもりをドラッグしても L が変わる
    {
      await page.evaluate(() => { __oto_debug.drive.setV(120); __oto_debug.drive.setL(0.60); }); await frames();
      const cb2 = await page.locator('.view.show canvas').first().boundingBox();
      const Wp = await page.evaluate(() => __oto_debug.drive.weightPx()), O = await page.evaluate(() => __oto_debug.drive.originPx());
      const P6 = await page.evaluate(() => __oto_debug.drive.pulleyPx());
      const X90 = O + (P6.X - O) * 0.9 / 0.6;
      await dragPx(cb2, Wp.X, Wp.Y, X90 + (Wp.X - P6.X), Wp.Y);
      const Lw = await page.evaluate(() => __oto_debug.drive.getL());
      check('振動子 おもりをドラッグ → L が変わる', near(Lw, 0.9, 0.02), `L=${Lw}`);
    }
  }
  await page.evaluate(() => { const d = __oto_debug.drive; d.setL(0.30); d.setF(0); for (let f = 0; f <= 700; f += 2) d.setF(f); d.setF(400); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'resonance-drive-L030.png') });
  await page.evaluate(() => __oto_debug.drive.setL(0.60));

  // --- タブ3 ---
  await page.evaluate(() => { location.hash = '#pipe'; });
  await page.waitForTimeout(400);
  r = await page.evaluate(() => { const d = __oto_debug.pipe; d.setType('closed'); d.setL(0.5); d.setV(340); d.setCorr(false); d.setN(3); return d.geom(); });
  check('閉管 3倍振動 L=0.50 → λ=0.667 m, f=510 Hz', near(r.lam, 2 / 3, 1e-9) && near(r.f, 510, 1e-9), `${r.lam} ${r.f}`);
  await page.waitForTimeout(100);
  ft = await formula();
  check('閉管 読み出し L = nλ/4（数値代入）', ft.includes('λ = 4L/n = 4 × 0.50 m / 3') && ft.includes('510.0 Hz'), ft);
  r = await page.evaluate(() => { const d = __oto_debug.pipe; const G = d.geom(); return { u0: G.u(0), uL: G.u(G.L), nodes: G.nodes, antis: G.antis }; });
  check('閉管 閉端は変位の節・開口端は腹', Math.abs(r.u0) < 1e-12 && near(Math.abs(r.uL), 1, 1e-9), JSON.stringify(r));
  r = await page.evaluate(() => { const d = __oto_debug.pipe; d.setType('open'); d.setN(2); return d.geom(); });
  check('開管 2倍振動 L=0.50 → f=680 Hz', near(r.f, 680, 1e-9), r.f);
  r = await page.evaluate(() => { const d = __oto_debug.pipe; d.setType('closed'); d.setN(1); d.setCorr(true); d.setR(3); return d.geom(); });
  check('閉管 補正ON r=3cm → Δx=1.8cm, λ=4(L+Δx)=2.072 m, f=164.1 Hz', near(r.dx, 0.018, 1e-9) && near(r.lam, 2.072, 1e-9) && near(r.f, 340 / 2.072, 1e-9), `${r.dx} ${r.lam} ${r.f}`);
  check('閉管 補正ON 腹は管口の Δx 外側', near(r.antis[0], 0.518, 1e-9), r.antis.join(','));
  await page.evaluate(() => __oto_debug.pipe.setDens(true));
  await page.evaluate(() => __oto_debug.pipe.setN(5));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'resonance-pipe-dens-corr.png') });
  r = await page.evaluate(() => { const d = __oto_debug.pipe; d.setType('open'); d.setN(3); return d.geom(); });
  check('開管 補正ON L+2Δx = 3λ/2', near(r.lam, 2 * (0.5 + 0.036) / 3, 1e-9), r.lam);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'resonance-pipe-open-corr.png') });
  await page.evaluate(() => { const d = __oto_debug.pipe; d.setDens(false); d.setCorr(false); d.setType('closed'); d.setN(1); });

  // --- タブ4（管A・管B の2本） ---
  await page.evaluate(() => { location.hash = '#tube'; });
  await page.waitForTimeout(500);
  r = await page.evaluate(() => {
    const d = __oto_debug.tube, lam = d.lam(), dx = d.dX();
    const l1 = lam / 4 - dx, l2 = 3 * lam / 4 - dx;
    return { lam, dx, l1, l2, r1: d.resp(l1), r2: d.resp(l2), rm: d.resp(lam / 2 - dx), loc: d.resp(l1) > d.resp(l1 - 0.5) && d.resp(l1) > d.resp(l1 + 0.5) };
  });
  check('共鳴実験 512 Hz → λ = 66.41 cm, Δx = 0.90 cm', near(r.lam, 34000 / 512, 1e-9) && near(r.dx, 0.9, 1e-9), `${r.lam} ${r.dx}`);
  check('共鳴実験 l = λ/4 − Δx, 3λ/4 − Δx で応答最大（=1）', near(r.r1, 1, 1e-9) && near(r.r2, 1, 1e-9) && r.loc, `l1=${r.l1.toFixed(2)} l2=${r.l2.toFixed(2)}`);
  check('共鳴実験 l = λ/2 − Δx では応答が小さい', r.rm < 0.1, r.rm);
  // 管A・管B の取っ手を別々にマウスでドラッグ
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
  const cbox = await page.locator('.view.show canvas').first().boundingBox();
  const st0 = await page.evaluate(() => ({ A: __oto_debug.tube.getL('A'), B: __oto_debug.tube.getL('B'), rA: __oto_debug.tube.recCount('A'), rB: __oto_debug.tube.recCount('B') }));
  let gp = await page.evaluate(() => __oto_debug.tube.gripPx('A'));
  let ty = await page.evaluate(() => __oto_debug.tube.pxOfL(40));
  await dragPx(cbox, gp.X, gp.Y, gp.X, ty);
  const st1 = await page.evaluate(() => ({ A: __oto_debug.tube.getL('A'), B: __oto_debug.tube.getL('B'), rA: __oto_debug.tube.recCount('A'), rB: __oto_debug.tube.recCount('B') }));
  check('共鳴実験 管A の取っ手をドラッグ → 管A の l だけ変わる', near(st1.A, 40, 1.5) && st0.A < 10 && st1.B === st0.B, JSON.stringify({ st0, st1 }));
  check('共鳴実験 管A で通った範囲が管A のグラフに記録される', st1.rA > st0.rA + 500 && st1.rB === st0.rB, JSON.stringify({ st0, st1 }));
  gp = await page.evaluate(() => __oto_debug.tube.gripPx('B'));
  ty = await page.evaluate(() => __oto_debug.tube.pxOfL(70));
  await dragPx(cbox, gp.X, gp.Y, gp.X, ty);
  const st2 = await page.evaluate(() => ({ A: __oto_debug.tube.getL('A'), B: __oto_debug.tube.getL('B'), rA: __oto_debug.tube.recCount('A'), rB: __oto_debug.tube.recCount('B') }));
  check('共鳴実験 管B の取っ手をドラッグ → 管B の l だけ変わる', near(st2.B, 70, 1.5) && st2.A === st1.A, JSON.stringify({ st1, st2 }));
  check('共鳴実験 管B で通った範囲が管B のグラフに記録される', st2.rB > st1.rB + 500 && st2.rA === st1.rA, JSON.stringify({ st1, st2 }));
  const roTxt = await page.evaluate(() => [...document.querySelectorAll('.view.show .controls .readout')].map(e => e.textContent));
  check('共鳴実験 管ごとの l の読み出し', roTxt.length === 2 && roTxt[0].includes(st2.A.toFixed(2)) && roTxt[1].includes(st2.B.toFixed(2)), roTxt.join(' | '));
  const paused = await page.evaluate(() => document.querySelector('.view.show .status').hidden);
  check('共鳴実験 取っ手のドラッグでは停止しない', paused, String(paused));
  // ±ボタンは管ごと
  const bA = await page.evaluate(() => __oto_debug.tube.getL('B'));
  await page.locator('.view.show button', { hasText: '↓ 1 cm' }).nth(0).click();
  await page.waitForTimeout(80);
  check('共鳴実験 管A の ↓1 cm は管A だけ動かす', near(await page.evaluate(() => __oto_debug.tube.getL('A')), st2.A + 1, 1e-9) && (await page.evaluate(() => __oto_debug.tube.getL('B'))) === bA);
  await page.locator('.view.show button', { hasText: '↑ 0.1' }).nth(1).click();
  await page.waitForTimeout(80);
  check('共鳴実験 管B の ↑0.1 は管B だけ動かす', near(await page.evaluate(() => __oto_debug.tube.getL('B')), bA - 0.1, 1e-9));
  // 管A=1回目・管B=2回目の共鳴付近（0.1 cm 刻みで置く）→ λ と Δx の計算値が理論値に近い
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL('A', Math.round((d.lam() / 4 - d.dX()) * 10) / 10); d.setL('B', Math.round((3 * d.lam() / 4 - d.dX()) * 10) / 10); });
  await page.waitForTimeout(150);
  r = await page.evaluate(() => { const d = __oto_debug.tube; return { V: d.values(), lam: d.lam(), dx: d.dX() }; });
  check('共鳴実験 λ = 2(l₂ − l₁) が v/f に近い', near(r.V.lam, r.lam, 0.4), `${r.V.lam.toFixed(2)} vs ${r.lam.toFixed(2)}`);
  check('共鳴実験 Δx = λ/4 − l₁ が 0.6r = 0.90 cm に近い', near(r.V.dx, 0.9, 0.2), r.V.dx.toFixed(3));
  check('共鳴実験 v = fλ が 340 m/s に近い', near(r.V.v, 340, 2), r.V.v.toFixed(1));
  ft = await page.evaluate(() => [...document.querySelectorAll('.view.show .controls .formula')].map(e => e.textContent).join(' / '));
  check('共鳴実験 読み出しに l₁・l₂・l₂−l₁・λ・Δx・v（数値代入）', ft.includes('l₁ = ' + r.V.l1.toFixed(2)) && ft.includes('l₂ − l₁ = ') && ft.includes('λ = 2(l₂ − l₁) = 2 × ') && ft.includes('Δx = λ/4 − l₁') && ft.includes('(l₂ − 3l₁)/2') && ft.includes('v = fλ = 512 Hz ×'), ft);
  const bodyTxt = await page.evaluate(() => document.body.innerText);
  check('共鳴実験 弁明・理由の文を画面に出していない', !/判定していない|自分で確かめる|拡大|計算結果の音|の理由：/.test(bodyTxt), (bodyTxt.match(/判定していない|自分で確かめる|拡大|計算結果の音|の理由：/) || [''])[0]);
  // 共鳴していない位置でも判定せずそのまま計算
  r = await page.evaluate(() => { const d = __oto_debug.tube; d.setL('A', 10); d.setL('B', 30); return d.values(); });
  check('共鳴実験 共鳴していない位置でもそのままの数値で計算（判定しない）', near(r.lam, 40, 1e-9) && near(r.dx, 0, 1e-9), JSON.stringify(r));
  // 補正 ON：腹の表示位置が管口より Δx 上
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL('A', Math.round((d.lam() / 4 - d.dX()) * 100) / 100); d.setL('B', Math.round((3 * d.lam() / 4 - d.dX()) * 100) / 100); });
  await page.waitForTimeout(200);
  r = await page.evaluate(() => { const d = __oto_debug.tube; return { A: d.shown('A'), B: d.shown('B'), dx: d.dX() }; });
  const topAnti = arr => arr.filter(m => m.kind === 'a').sort((p, q) => q.y - p.y)[0];
  check('共鳴実験 補正ON 管A: 腹の表示が管口より Δx 上', topAnti(r.A) && near(topAnti(r.A).y, r.dx, 0.05) && topAnti(r.A).y > 0.5, JSON.stringify(topAnti(r.A)));
  check('共鳴実験 補正ON 管B: 腹の表示が管口より Δx 上', topAnti(r.B) && near(topAnti(r.B).y, r.dx, 0.05), JSON.stringify(topAnti(r.B)));
  await page.screenshot({ path: path.join(OUT, 'resonance-tube-resonant.png') });
  await page.evaluate(() => __oto_debug.tube.setCorr(false));
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL('A', Math.round(d.lam() / 4 * 100) / 100); d.setL('B', Math.round(3 * d.lam() / 4 * 100) / 100); });
  await page.waitForTimeout(200);
  r = await page.evaluate(() => { const d = __oto_debug.tube; return { A: d.shown('A'), B: d.shown('B'), dx: d.dX() }; });
  check('共鳴実験 補正OFF: 腹は管口ちょうど', r.dx === 0 && topAnti(r.A) && near(topAnti(r.A).y, 0, 0.05) && near(topAnti(r.B).y, 0, 0.05), JSON.stringify([topAnti(r.A), topAnti(r.B)]));
  await page.evaluate(() => __oto_debug.tube.setCorr(true));
  // 印をつける（管ごと）
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL('A', d.lam() / 4 - d.dX()); d.setL('B', 3 * d.lam() / 4 - d.dX()); });
  await page.locator('.view.show button', { hasText: 'この位置に印をつける' }).nth(0).click();
  await page.locator('.view.show button', { hasText: 'この位置に印をつける' }).nth(1).click();
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL('A', 20); d.setL('B', 60); });
  await page.waitForTimeout(200);
  const mk = await page.evaluate(() => __oto_debug.tube.marks());
  r = await page.evaluate(() => __oto_debug.tube.values());
  ft = await page.evaluate(() => document.querySelector('.view.show .controls .formula').textContent);
  check('共鳴実験 印は管ごと・読み出しは印の値（水面を動かしても印の値）', mk[0] != null && mk[1] != null && near(r.l1, mk[0], 1e-9) && near(r.l2, mk[1], 1e-9) && ft.includes('管A の印') && ft.includes('管B の印'), ft);
  check('共鳴実験 印から l₂ − l₁ = λ/2', ft.includes('l₂ − l₁ = ' + mk[1].toFixed(2) + ' cm − ' + mk[0].toFixed(2) + ' cm = ' + (mk[1] - mk[0]).toFixed(2) + ' cm'), ft);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'resonance-tube-marked.png') });
  // 自動で水面を下げる（管ごと）
  const lBb = await page.evaluate(() => __oto_debug.tube.getL('B'));
  await page.locator('.view.show button', { hasText: '水面をゆっくり下げる' }).nth(0).click();
  await page.waitForTimeout(1200);
  const au = await page.evaluate(() => ({ a: __oto_debug.tube.auto('A'), b: __oto_debug.tube.auto('B'), l: __oto_debug.tube.getL('A'), lB: __oto_debug.tube.getL('B') }));
  check('共鳴実験 管A だけ自動で水面が下がる', au.a && !au.b && au.l > 22 && au.lB === lBb, JSON.stringify(au));
  await page.locator('.view.show button', { hasText: '止める' }).first().click();
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL('A', 1); d.setL('A', 95); d.setL('A', 40); d.setL('B', 1); d.setL('B', 30); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'resonance-tube-graph.png') });
  // 音
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.waitForTimeout(200);
  check('共鳴実験 音トグル ON', await page.evaluate(() => __oto_debug.tube.sound.voice.on));
  await page.locator('.view.show button.stopSnd').click();
  check('共鳴実験 停止ボタンで止まる', await page.evaluate(() => !__oto_debug.tube.sound.voice.on));
  // 振動数を変えるとグラフ・印が消える
  await page.evaluate(() => __oto_debug.tube.setF(256));
  check('共鳴実験 振動数を変えると印が消える', (await page.evaluate(() => __oto_debug.tube.marks().every(m => m == null))));
  check('共鳴実験 振動数を変えるとグラフが消える', (await page.evaluate(() => __oto_debug.tube.recCount('A') + __oto_debug.tube.recCount('B'))) === 2);
  // 時間バー
  await page.evaluate(() => { [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('停止')).click(); });
  const tv = await page.evaluate(() => document.querySelector('.view.show .tval').textContent);
  check('時間表示は周期単位（スローモーション）', tv.includes('周期'), tv);

  check('操作後もエラーなし', errors.length === 0, errors.join(' | '));

  /* ---------- 3. スマホ幅で 2 本の管の確認スクショ（投影） ---------- */
  {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p2 = await c2.newPage();
    await p2.goto(`${base}?mode=proj#tube`);
    await p2.waitForTimeout(700);
    await p2.evaluate(() => { const d = __oto_debug.tube; d.setL('A', d.lam() / 4 - d.dX()); d.setL('B', 3 * d.lam() / 4 - d.dX()); });
    await p2.waitForTimeout(300);
    await p2.locator('.view.show .panel').first().screenshot({ path: path.join(OUT, 'resonance-tube-proj-390-panel.png') });
    await c2.close();
  }
  await browser.close();
  server.close();
  const failed = results.filter(x => !x.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
