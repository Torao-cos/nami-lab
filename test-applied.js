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
  const labels = await page.evaluate(() => [...document.querySelectorAll('nav.tabs button')].map(b => b.textContent));
  check('タブ名が 13/14/15/16', JSON.stringify(labels) === JSON.stringify(['13 素元波', '14 屈折', '15 回折（波動タンク）', '16 干渉']), JSON.stringify(labels));
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
  // 作図の途中量（BB′ = v₁Δt, AT = v₂Δt）が読み出しに出る
  await setSlider('媒質1の速さ', 1.5); await setSlider('媒質2の速さ', 1.0); await setSlider('入射角', 50);
  await page.waitForTimeout(300);
  const stepText = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check("屈折: 作図の途中量 Δt・BB′ = v₁Δt・AT = v₂Δt が出る",
    /Δt/.test(stepText) && /BB′ = v₁Δt/.test(stepText) && /AT = v₂Δt/.test(stepText), stepText.slice(0, 90));
  check("屈折: sin i = BB′/AB′ と sin r = AT/AB′ が出る",
    /sin i = BB′\/AB′/.test(stepText) && /sin r = AT\/AB′/.test(stepText), stepText.slice(60, 180));
  // BB′ = v₁Δt, AT = v₂Δt の数値が図形と一致する（AB′ = D, BB′ = D sin i, AT = D sin r）
  const geo = await page.evaluate(() => {
    const t = document.querySelector('.view.show .formula').textContent;
    const g = re => { const m = t.match(re); return m ? parseFloat(m[1]) : NaN; };
    return {
      ABp: g(/AB′ = ([\d.]+) m/), BBp: g(/BB′ = v₁Δt = [\d.]+ × [\d.]+ = ([\d.]+) m/),
      AT: g(/AT = v₂Δt = [\d.]+ × [\d.]+ = ([\d.]+) m/)
    };
  });
  const si50 = Math.sin(50 * Math.PI / 180), sr50 = Math.asin((1.0 / 1.5) * si50);
  check("屈折: BB′ = AB′ sin i, AT = AB′ sin r が数値で成り立つ",
    Math.abs(geo.BBp - geo.ABp * si50) < 0.02 && Math.abs(geo.AT - geo.ABp * Math.sin(sr50)) < 0.02,
    JSON.stringify(geo) + ` 期待 BB′=${(geo.ABp * si50).toFixed(2)} AT=${(geo.ABp * Math.sin(sr50)).toFixed(2)}`);
  // 全反射は「詳しく」の中だけ（既定は「屈折波なし」のみ）
  await setSlider('媒質1の速さ', 1.0); await setSlider('媒質2の速さ', 2.0); await setSlider('入射角', 70);
  await page.waitForTimeout(250);
  const totText = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('既定では「屈折波なし」だけ（全反射・臨界角は出さない）',
    totText.includes('屈折波なし') && !totText.includes('全反射') && !totText.includes('臨界角'), totText.slice(0, 80));
  await page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('詳しく')).click());
  await page.waitForTimeout(300);
  const totText2 = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('「詳しく」で全反射・臨界角が出る', totText2.includes('全反射') && totText2.includes('臨界角'), totText2.slice(0, 120));
  await shot(page, 'app-refract-total-1280.png');
  await page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('詳しく')).click());
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
  // ◀（コマ戻し）は無効
  const back = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.view.show .timebar button')].find(x => x.textContent === '◀');
    return { disabled: b.disabled, title: b.title };
  });
  check('回折タブの ◀ は無効（title あり）', back.disabled && /戻せません/.test(back.title), JSON.stringify(back));
  // ←キーでも t は戻らない（空振りしない）
  await page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('停止')).click());
  await page.waitForTimeout(250);
  const tBack = await page.evaluate(async () => {
    const tv = document.querySelector('.view.show .tval');
    const before = parseFloat(tv.textContent.replace(/[^\d.]/g, ''));
    document.body.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return { before, after: parseFloat(tv.textContent.replace(/[^\d.]/g, '')) };
  });
  check('回折タブは ← キーでも t が戻らない', Math.abs(tBack.after - tBack.before) < 1e-6, JSON.stringify(tBack));
  await page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('再開')).click());
  await page.waitForTimeout(200);
  // 速さ v を可変にした: λ = vT（T 固定で v を半分 → λ も半分、f = 1/T は不変）
  const reset = () => page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('リセット')).click());
  await setSlider('波の速さ', 0.5); await setSlider('波源の周期', 24); await reset();
  await page.waitForTimeout(5000);
  const pv1 = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-v050-1280.png');
  check('回折: v=0.50・T=24 → λ = vT = 12 セルが場でも測れる',
    Math.abs(pv1.lamSet - 12) < 1e-6 && Math.abs(pv1.lamMeas - 12) / 12 < 0.15,
    `λ(設定)=${pv1.lamSet} λ(実測)=${pv1.lamMeas.toFixed(2)} セル`);
  await setSlider('波の速さ', 0.25); await reset();
  await page.waitForTimeout(6000);
  const pv2 = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-v025-1280.png');
  check('回折: v を半分にすると λ も半分（T・f は不変）',
    Math.abs(pv2.Tst - pv1.Tst) < 1e-9 && Math.abs(pv2.lamSet - 6) < 1e-6 && Math.abs(pv2.lamMeas - 6) / 6 < 0.15,
    `v=${pv2.v} T=${pv2.Tst}（f 不変） λ(設定)=${pv2.lamSet} λ(実測)=${pv2.lamMeas.toFixed(2)} セル`);
  check('回折: 画面に v・T(f)・λ = vT が同時に出る',
    await page.evaluate(() => {
      const ctls = [...document.querySelectorAll('.view.show .controls .ctl')].map(c => c.textContent).join(' | ');
      return /波の速さ v/.test(ctls) && /波源の周期 T/.test(ctls) && /λ = vT/.test(ctls);
    }));
  await setSlider('波の速さ', 0.5); await reset();
  await page.waitForTimeout(4000);
  // 狭いスリット（w≲λ）と広いスリット（w≫λ）の回り込み比較
  const setD = (label, val) => setSlider(label, val);
  await setD('スリット幅', 6); await setD('波源の周期', 28);   // v=0.50 → λ = vT = 14 セル
  await page.waitForTimeout(4000);
  const narrow = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-narrow-1280.png');
  await setD('スリット幅', 56); await setD('波源の周期', 12);  // λ = 6 セル
  await page.waitForTimeout(4000);
  const wide = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-wide-1280.png');
  const rn = narrow.behindOff / narrow.behindAxis, rw = wide.behindOff / wide.behindAxis;
  check('w≲λ の方が軸外へ回り込む割合が大きい', rn > rw, `narrow(w/λ=0.43)=${rn.toFixed(3)} > wide(w/λ=9.3)=${rw.toFixed(3)}`);
  // 二重スリット
  await page.selectOption('.view.show .controls select', 'double');
  await setD('スリット幅', 8); await setD('波源の周期', 24);   // λ = 12 セル
  await page.waitForTimeout(4500);
  await shot(page, 'app-diffract-double-1280.png');
  // リセット
  await page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('リセット')).click());
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__nami_debug.probe());
  check('リセットで場がゼロクリアされる', after.step < 30 && after.front < 0.2, JSON.stringify({ step: after.step, front: +after.front.toFixed(3) }));
  await page.selectOption('.view.show .controls select', 'single');
  await setD('スリット幅', 24); await setD('波源の周期', 24);

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
  check('読み出しは経路差「1.00 λ」まで（自動判定の語は出さない）',
    res.text.includes('1.00 λ') && !/強め合い|弱め合い|中間/.test(res.text), res.text.slice(0, 140));
  check('干渉タブに点 P の y-t パネルがある',
    await page.evaluate(() => [...document.querySelectorAll('.view.show .panelTitle')].some(p => p.textContent.includes('点 P の y-t'))));
  const ampCon = await page.evaluate(() => window.__nami_debug.ampP());
  check('経路差 1.00λ の点では P の y-t の振幅 ≈ 2A', Math.abs(ampCon - 2) < 0.12, '振幅 = ' + ampCon.toFixed(3) + ' (2A = 2)');
  await shot(page, 'app-interfere-1280.png');
  // 弱め合い線（m=0.5）
  await page.evaluate(() => {
    const d = window.__nami_debug, st = d.st, lam = st.lam, dd = st.d;
    const a = 0.5 * lam / 2, c = dd / 2, b = Math.sqrt(c * c - a * a), u = 1.0;
    d.P.x = a * Math.cosh(u); d.P.y = b * Math.sinh(u);
  });
  await page.waitForTimeout(300);
  const res2 = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('経路差 0.50λ の読み出し（判定語なし）', res2.includes('0.50 λ') && !/強め合い|弱め合い|中間/.test(res2), res2.slice(0, 140));
  const ampDes = await page.evaluate(() => window.__nami_debug.ampP());
  check('経路差 0.50λ の点では P の y-t の振幅 ≈ 0', ampDes < 0.12, '振幅 = ' + ampDes.toFixed(3));
  await shot(page, 'app-interfere-half-1280.png');
  // 教科書の作図＋逆位相
  await page.evaluate(() => [...document.querySelectorAll('.view.show .controls label')].find(l => l.textContent.includes('教科書の作図')).querySelector('input').click());
  await page.waitForTimeout(600);
  await shot(page, 'app-interfere-circles-1280.png');
  await page.selectOption('.view.show .controls select', 'pi');
  await page.waitForTimeout(400);
  const ampAnti = await page.evaluate(() => window.__nami_debug.ampP());
  check('逆位相にすると同じ点（0.50λ）の振幅が 2A に入れ替わる', Math.abs(ampAnti - 2) < 0.12, '振幅 = ' + ampAnti.toFixed(3));
  const res3 = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('逆位相の注記は事実の記述（判定語を使わない）',
    res3.includes('S₂ は S₁ が山を出す瞬間に谷を出す') && !/強め合い|弱め合い|中間/.test(res3), res3.slice(0, 160));
  await page.selectOption('.view.show .controls select', '0');
  await page.evaluate(() => [...document.querySelectorAll('.view.show .controls label')].find(l => l.textContent.includes('教科書の作図')).querySelector('input').click());
  await page.evaluate(() => { const d = window.__nami_debug; d.P.x = 2.4; d.P.y = 1.6; });
  await page.waitForTimeout(400);

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
