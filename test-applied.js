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
  check('タブ6つ', await page.locator('nav.tabs button').count() === 6);
  const labels = await page.evaluate(() => [...document.querySelectorAll('nav.tabs button')].map(b => b.textContent));
  check('タブ名が 13/14/15/16/17/18', JSON.stringify(labels) === JSON.stringify(['13 素元波', '14 反射', '15 屈折', '16 屈折の作図と全反射', '17 回折（波動タンク）', '18 干渉']), JSON.stringify(labels));
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

  /* ---------- 2. 14 反射（隊列モデル＋素元波の作図） ---------- */
  const setSlider = (label, val) => page.evaluate(([label, val]) => {
    const ctl = [...document.querySelectorAll('.view.show .controls .ctl')].find(c => c.textContent.includes(label));
    const r = ctl.querySelector('input[type=range]'); r.value = val; r.dispatchEvent(new Event('input', { bubbles: true }));
  }, [label, val]);
  const clickTimebar = label => page.evaluate(l => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes(l)).click(), label);
  const clickToggle = (label, root = '.controls') => page.evaluate(([l, r]) => [...document.querySelectorAll('.view.show ' + r + ' label')].find(x => x.textContent.includes(l)).querySelector('input').click(), [label, root]);

  await page.goto(U + '#reflect');
  await page.waitForTimeout(1600);
  const fpsRL = await fps();
  await shot(page, 'app-reflect-1280.png');
  check('14 反射 fps', fpsRL >= 30, fpsRL + ' fps');
  check('14 反射はパネル2枚（隊列モデル／作図）', await page.evaluate(() => {
    const ts = [...document.querySelectorAll('.view.show .panelTitle')].map(p => p.textContent);
    return ts.length === 2 && ts[0].includes('隊列モデル') && ts[1].includes('作図');
  }));
  // 隊列モデル: 壁に着いた点は「法線成分だけ」が反転する（壁に沿う成分と速さは変わらない＝反射角＝入射角）
  const marchRL = await page.evaluate(() => {
    const d = window.__nami_debug, g = d.reflGeom(), h = 0.002;
    const a = g.wall * Math.PI / 180, n = { x: Math.cos(a), y: Math.sin(a) }, w = { x: -Math.sin(a), y: Math.cos(a) };
    const vel = (m, s, t) => {
      const p0 = d.reflPos(m, s, t), p1 = d.reflPos(m, s, t + h);
      const vx = (p1.x - p0.x) / h, vy = (p1.y - p0.y) / h;
      return { n: vx * n.x + vy * n.y, w: vx * w.x + vy * w.y, sp: Math.hypot(vx, vy), hit: p1.hit };
    };
    return { v: g.v, i: g.i, before: vel(1, 0, g.T - 0.4), after: vel(1, 0, g.T + 0.4) };
  });
  const angN = c => Math.atan2(Math.abs(c.w), Math.abs(c.n)) * 180 / Math.PI;
  check('隊列モデル: 壁に着く前は速さ v・入射角 i で壁へ向かう',
    !marchRL.before.hit && marchRL.before.n > 0 && Math.abs(marchRL.before.sp - marchRL.v) < 1e-3 && Math.abs(angN(marchRL.before) - marchRL.i) < 0.1,
    `速さ=${marchRL.before.sp.toFixed(3)}(v=${marchRL.v}) 法線からの角=${angN(marchRL.before).toFixed(2)}°(i=${marchRL.i}°)`);
  check('隊列モデル: 壁に着いた点は法線成分だけが反転（壁に沿う成分と速さは不変）',
    marchRL.after.hit && Math.abs(marchRL.after.n + marchRL.before.n) < 1e-3 && Math.abs(marchRL.after.w - marchRL.before.w) < 1e-3 && Math.abs(marchRL.after.sp - marchRL.v) < 1e-3,
    `法線成分 ${marchRL.before.n.toFixed(3)} → ${marchRL.after.n.toFixed(3)}／壁に沿う成分 ${marchRL.before.w.toFixed(3)} → ${marchRL.after.w.toFixed(3)}`);
  check('隊列モデル: 反射後の向きが法線について入射と対称（反射角＝入射角）',
    Math.abs(angN(marchRL.after) - angN(marchRL.before)) < 0.05,
    `${angN(marchRL.before).toFixed(2)}° → ${angN(marchRL.after).toFixed(2)}°`);
  // 作図（素元波の包絡線）: BB′ = v·Δt = AA″ ・ 包絡線は全ての素元波に接する ・ そこから出る r は i に等しい
  for (const [i, wall] of [[40, 0], [65, 0], [25, 30], [55, -20]]) {
    await setSlider('入射角', i); await setSlider('壁の角度', wall);
    await page.waitForTimeout(220);
    const d = await page.evaluate(() => window.__nami_debug.reflDraft());
    check(`作図: BB′ = v·Δt = AA″（i=${i}°, 壁 ${wall}°）`, Math.abs(d.BBp - d.AAp) < 1e-9 && Math.abs(d.BBp - d.v * d.dt) < 1e-9,
      `BB′=${d.BBp.toFixed(4)} AA″=${d.AAp.toFixed(4)} vΔt=${(d.v * d.dt).toFixed(4)}`);
    check(`作図: 包絡線が壁上の各点の素元波に接する（i=${i}°, 壁 ${wall}°）`, d.maxTangentErr < 1e-9, '最大のずれ ' + d.maxTangentErr.toExponential(1) + ' m');
    check(`作図: 包絡線から求めた反射角 = 入射角（i=${i}°, 壁 ${wall}°）`, Math.abs(d.r - d.i) < 1e-6, `i=${d.i}° r=${d.r.toFixed(6)}°`);
    check(`作図: BB′ = AB′ sin i（i=${i}°, 壁 ${wall}°）`, Math.abs(d.BBp - d.ABp * Math.sin(i * Math.PI / 180)) < 1e-9,
      `BB′=${d.BBp.toFixed(4)} AB′sin i=${(d.ABp * Math.sin(i * Math.PI / 180)).toFixed(4)}`);
  }
  await setSlider('入射角', 40); await setSlider('壁の角度', 0);
  await page.waitForTimeout(250);
  const rlText = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check("14 反射の読み出しに BB′ = v·Δt = AA″ と i = r が現在値で出る",
    /BB′ = v·Δt/.test(rlText) && /AA″/.test(rlText) && /i = r = 40.0°/.test(rlText) && /合同/.test(rlText), rlText.slice(0, 120));
  check('14 反射（作図）は時間スクラブで過去へ戻れる', await page.evaluate(async () => {
    const bar = document.querySelector('.view.show .timebar');
    [...bar.querySelectorAll('button')].find(b => b.textContent.includes('停止')).click();
    await new Promise(r => setTimeout(r, 120));
    const r = bar.querySelector('input[type=range]'), before = parseFloat(r.value);
    r.value = 0.4; r.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 150));
    const after = parseFloat(document.querySelector('.view.show .tval').textContent.replace(/[^\d.]/g, ''));
    [...bar.querySelectorAll('button')].find(b => b.textContent.includes('再開')).click();
    return before > 1 && after < 1;
  }));
  // 入射角の自動スイープ
  await clickToggle('自動で動かす');
  const sweepRL = await page.evaluate(async () => {
    const val = () => parseFloat([...document.querySelectorAll('.view.show .controls .ctl')].find(c => c.textContent.includes('入射角')).querySelector('input[type=range]').value);
    const seen = new Set();
    for (let k = 0; k < 24; k++) { await new Promise(r => setTimeout(r, 120)); seen.add(val()); }
    return { n: seen.size, max: Math.max(...seen), min: Math.min(...seen) };
  });
  check('14 反射: 入射角の自動スイープで i が連続に変わる', sweepRL.n >= 8 && sweepRL.max - sweepRL.min >= 10, JSON.stringify(sweepRL));
  await clickToggle('自動で動かす');
  await setSlider('入射角', 40);
  // 「詳しく」→ 壁つき波動タンク（切替中は ◀ と時間バーが無効）
  await clickTimebar('詳しく');
  await clickToggle('波動タンク', '.controls.detail');
  await page.waitForTimeout(5000);
  const tankRL = await page.evaluate(() => window.__nami_debug.reflTank());
  await shot(page, 'app-reflect-tank-1280.png');
  check('14 反射: 詳しくで右が壁つき波動タンクになり、波が立つ', tankRL.on && tankRL.step > 100 && tankRL.e > 0.05,
    `格子 ${tankRL.nx}×${tankRL.ny} λ=${tankRL.lam} セル ${tankRL.step} steps rms=${tankRL.e.toFixed(3)}`);
  check('14 反射: タンク表示中は ◀ と時間バーが無効', await page.evaluate(() => {
    const b = [...document.querySelectorAll('.view.show .timebar button')].find(x => x.textContent === '◀');
    const r = document.querySelector('.view.show .timebar input[type=range]');
    return b.disabled && r.disabled;
  }));
  check('14 反射: タンク表示中は ← キーでも t が戻らない', await page.evaluate(async () => {
    [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('停止')).click();
    await new Promise(r => setTimeout(r, 200));
    const tv = document.querySelector('.view.show .tval');
    const before = parseFloat(tv.textContent.replace(/[^\d.]/g, ''));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const after = parseFloat(tv.textContent.replace(/[^\d.]/g, ''));
    [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('再開')).click();
    return Math.abs(after - before) < 1e-6;
  }));
  await clickToggle('波動タンク', '.controls.detail');
  await page.waitForTimeout(300);
  check('14 反射: 作図に戻すと ◀ と時間バーが戻る', await page.evaluate(() => {
    const b = [...document.querySelectorAll('.view.show .timebar button')].find(x => x.textContent === '◀');
    return !b.disabled && !document.querySelector('.view.show .timebar input[type=range]').disabled;
  }));
  await clickTimebar('詳しく');
  await page.waitForTimeout(200);
  await shot(page, 'app-reflect-1280.png');

  /* ---------- 3. 15 屈折（左＝隊列モデル／右＝二媒質の波動タンク） ---------- */
  await page.goto(U + '#refract');
  await page.waitForTimeout(9000);
  const fpsR = await fps();
  await shot(page, 'app-refract-1280.png');
  check('15 屈折 fps', fpsR >= 30, fpsR + ' fps');
  check('15 屈折はパネル2枚（隊列モデル／波動タンク）',
    await page.evaluate(() => {
      const ts = [...document.querySelectorAll('.view.show .panelTitle')].map(p => p.textContent);
      return ts.length === 2 && ts[0].includes('隊列モデル') && ts[1].includes('波動タンク');
    }));
  // 隊列モデル: 各点は媒質1で速さ v₁・向き i、媒質2で速さ v₂・向き r（スネルの法則）
  const march = await page.evaluate(() => {
    const d = window.__nami_debug, g = d.geom(), t0 = 3.0, h = 0.002;
    const sp = (p, q) => Math.hypot(q.x - p.x, q.y - p.y) / h;
    const ang = (p, q) => Math.atan2(q.x - p.x, -(q.y - p.y)) * 180 / Math.PI;   // 法線（下向き）からの角
    const A0 = d.march(0, 3, t0), A1 = d.march(0, 3, t0 + h);   // まだ境界に着いていない点
    const B0 = d.march(0, 0, t0), B1 = d.march(0, 0, t0 + h);   // すでに境界を越えた点
    return {
      v1: g.v1, v2: g.v2, i: g.i * 180 / Math.PI, r: g.rr * 180 / Math.PI,
      m1: { med: A0.med, sp: sp(A0, A1), ang: ang(A0, A1) },
      m2: { med: B0.med, sp: sp(B0, B1), ang: ang(B0, B1) }
    };
  });
  check('隊列モデル: 境界の手前では速さ v₁・向き i で進む',
    march.m1.med === 1 && Math.abs(march.m1.sp - march.v1) < 0.01 && Math.abs(march.m1.ang - march.i) < 0.2,
    `速さ=${march.m1.sp.toFixed(3)}(v₁=${march.v1}) 向き=${march.m1.ang.toFixed(1)}°(i=${march.i}°)`);
  check('隊列モデル: 境界を越えた点は速さ v₂・向き r に変わる',
    march.m2.med === 2 && Math.abs(march.m2.sp - march.v2) < 0.01 && Math.abs(march.m2.ang - march.r) < 0.2,
    `速さ=${march.m2.sp.toFixed(3)}(v₂=${march.v2}) 向き=${march.m2.ang.toFixed(1)}°(r=${march.r.toFixed(1)}°)`);
  check('隊列モデル: 曲がった向きがスネルの法則 sin r = (v₂/v₁) sin i を満たす',
    Math.abs(Math.sin(march.m2.ang * Math.PI / 180) - (march.v2 / march.v1) * Math.sin(march.m1.ang * Math.PI / 180)) < 0.004,
    `sin r=${Math.sin(march.r * Math.PI / 180).toFixed(4)} vs (v₂/v₁)sin i=${((march.v2 / march.v1) * Math.sin(march.i * Math.PI / 180)).toFixed(4)}`);
  // 波動タンク: 屈折波が媒質2へ届く
  const tank1 = await page.evaluate(() => window.__nami_debug.probeRF());
  check('波動タンク: 屈折波が媒質2に届く', tank1.med2 > 0.25 * tank1.med1,
    `med1=${tank1.med1.toFixed(3)} med2=${tank1.med2.toFixed(3)} (格子 ${tank1.nx}×${tank1.ny})`);
  // 左（隊列モデル）と右（タンク）の同調: λ の比・画面の横幅・境界に沿う見かけの波長（＝屈折角）
  const sync = await page.evaluate(() => window.__nami_debug.refractSync());
  check('15 屈折: タンクの λ₁:λ₂（セル）＝ 隊列モデルの λ₁:λ₂（m）＝ v₁:v₂',
    Math.abs(sync.lam1cell / sync.lam2cell - sync.lam1m / sync.lam2m) < 1e-9 && Math.abs(sync.lam1cell / sync.lam2cell - 1.5) < 1e-9,
    `λ₁=${sync.lam1m} m=${sync.lam1cell.toFixed(1)} セル／λ₂=${sync.lam2m} m=${sync.lam2cell.toFixed(1)} セル（1 m = ${sync.N.toFixed(1)} セル）`);
  check('15 屈折: タンクは遅い側の λ も 20 セル以上（数値分散を抑える）',
    Math.min(sync.lam1cell, sync.lam2cell) >= 20, `min λ = ${Math.min(sync.lam1cell, sync.lam2cell).toFixed(1)} セル`);
  check('15 屈折: 左の隊列モデルと右のタンクが同じ横幅［m］',
    Math.abs(sync.halfW - sync.nx / (2 * sync.N)) < 1e-9, `横半幅 ${sync.halfW.toFixed(2)} m ＝ ${sync.nx} セル ÷ ${sync.N.toFixed(1)} ÷ 2`);
  check('15 屈折: 波源の周期 ' + sync.Tst + ' ステップ ＝ 隊列モデルの T（λ₁ = c₁·Tst セル）',
    Math.abs(0.5 * sync.lam1m / Math.max(sync.lam1m, sync.lam2m) * sync.Tst - sync.lam1cell) < 0.6,
    `c₁·Tst = ${(0.5 * sync.lam1m / Math.max(sync.lam1m, sync.lam2m) * sync.Tst).toFixed(1)} セル vs λ₁ = ${sync.lam1cell.toFixed(1)} セル`);
  check('15 屈折: タンクの「境界に沿う見かけの波長」が媒質1と媒質2で一致（＝屈折の法則が場でも成り立つ）',
    Math.abs(sync.lamX1 - sync.lamX2) / sync.lamX1 < 0.08, `媒質1 ${sync.lamX1.toFixed(1)} セル／媒質2 ${sync.lamX2.toFixed(1)} セル`);
  check('15 屈折: その見かけの波長が λ₁/sin i（左右で同じ入射角）',
    Math.abs(sync.lamX1 - sync.lam1cell / Math.sin(sync.i * Math.PI / 180)) / sync.lamX1 < 0.08,
    `実測 ${sync.lamX1.toFixed(1)} セル vs λ₁/sin i = ${(sync.lam1cell / Math.sin(sync.i * Math.PI / 180)).toFixed(1)} セル`);
  const rTank = Math.asin(Math.min(1, sync.lam2cell / sync.lamX2)) * 180 / Math.PI;
  check('15 屈折: タンクの場から逆算した屈折角が隊列モデルの r と一致',
    Math.abs(rTank - sync.r) < 2.5, `タンク ${rTank.toFixed(1)}° vs 隊列モデル ${sync.r.toFixed(1)}°`);
  check('15 屈折タブの ◀ は無効',
    await page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(x => x.textContent === '◀').disabled));
  check('15 屈折タブは時間スクラブなし', await page.evaluate(() => document.querySelector('.view.show .timebar input[type=range]') === null));
  const rfText = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('15 屈折の読み出しに v₁・v₂・λ₁=v₁T・λ₂=v₂T・i・r が出る',
    /λ₁ = v₁T/.test(rfText) && /λ₂ = v₂T/.test(rfText) && /sin r = \(v₂\/v₁\) sin i/.test(rfText) && /r = /.test(rfText), rfText.slice(0, 150));
  // 全反射条件（v₂ > v₁ かつ大きい入射角）では媒質2にほとんど届かない
  await setSlider('媒質1の速さ', 0.5); await setSlider('媒質2の速さ', 2.0); await setSlider('入射角', 75);
  await clickTimebar('リセット');
  await page.waitForTimeout(7000);
  const tank2 = await page.evaluate(() => window.__nami_debug.probeRF());
  await shot(page, 'app-refract-total-1280.png');
  check('波動タンク: 全反射条件では媒質2にほとんど届かない', tank2.med2 < 0.12 * tank2.med1,
    `med1=${tank2.med1.toFixed(3)} med2=${tank2.med2.toFixed(3)} 比=${(tank2.med2 / tank2.med1).toFixed(3)}`);
  const rfText2 = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check('15 屈折: 全反射条件の読み出しは「屈折波なし」', rfText2.includes('屈折波なし'), rfText2.slice(0, 140));
  await setSlider('媒質1の速さ', 1.5); await setSlider('媒質2の速さ', 1.0); await setSlider('入射角', 50);
  await clickTimebar('リセット');
  await page.waitForTimeout(5500);
  await shot(page, 'app-refract-1280.png');

  /* ---------- 4. 16 屈折の作図と全反射 ---------- */
  await page.goto(U + '#refract2');
  await page.waitForTimeout(1200);
  const fpsR2 = await fps();
  await shot(page, 'app-refract2-1280.png');
  check('16 屈折の作図 fps', fpsR2 >= 30, fpsR2 + ' fps');
  const readNums = () => page.evaluate(() => [...document.querySelectorAll('.view.show .formula b')].slice(0, 3).map(b => parseFloat(b.textContent)));
  for (const [v1, v2, i] of [[1.5, 1.0, 50], [1.0, 2.0, 20], [0.8, 0.6, 70]]) {
    await setSlider('媒質1の速さ', v1); await setSlider('媒質2の速さ', v2); await setSlider('入射角', i);
    await page.waitForTimeout(250);
    const n = await readNums();
    const ok = n.length === 3 && Math.abs(n[0] - n[1]) < 0.02 && Math.abs(n[1] - n[2]) < 0.02 && Math.abs(n[1] - v1 / v2) < 0.02;
    check(`作図の読み出し sin i/sin r = v₁/v₂ = λ₁/λ₂ (v1=${v1}, v2=${v2}, i=${i}°)`, ok, JSON.stringify(n) + ' vs v1/v2=' + (v1 / v2).toFixed(3));
  }
  // 作図の途中量（BB′ = v₁Δt, AT = v₂Δt）が読み出しに出る
  await setSlider('媒質1の速さ', 1.5); await setSlider('媒質2の速さ', 1.0); await setSlider('入射角', 50);
  await page.waitForTimeout(300);
  const stepText = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  check("作図: 途中量 Δt・BB′ = v₁Δt・AT = v₂Δt が出る",
    /Δt/.test(stepText) && /BB′ = v₁Δt/.test(stepText) && /AT = v₂Δt/.test(stepText), stepText.slice(0, 90));
  check("作図: sin i = BB′/AB′ と sin r = AT/AB′ が出る",
    /sin i = BB′\/AB′/.test(stepText) && /sin r = AT\/AB′/.test(stepText), stepText.slice(60, 180));
  const geo = await page.evaluate(() => {
    const t = document.querySelector('.view.show .formula').textContent;
    const g = re => { const m = t.match(re); return m ? parseFloat(m[1]) : NaN; };
    return {
      ABp: g(/AB′ = ([\d.]+) m/), BBp: g(/BB′ = v₁Δt = [\d.]+ × [\d.]+ = ([\d.]+) m/),
      AT: g(/AT = v₂Δt = [\d.]+ × [\d.]+ = ([\d.]+) m/)
    };
  });
  const si50 = Math.sin(50 * Math.PI / 180), sr50 = Math.asin((1.0 / 1.5) * si50);
  check("作図: BB′ = AB′ sin i, AT = AB′ sin r が数値で成り立つ",
    Math.abs(geo.BBp - geo.ABp * si50) < 0.02 && Math.abs(geo.AT - geo.ABp * Math.sin(sr50)) < 0.02,
    JSON.stringify(geo) + ` 期待 BB′=${(geo.ABp * si50).toFixed(2)} AT=${(geo.ABp * Math.sin(sr50)).toFixed(2)}`);
  check('v₂ ≤ v₁ では「全反射は起きない」と出る', stepText.includes('全反射は起きない'), stepText.slice(-90));
  // 全反射・臨界角は既定で表示（「詳しく」に隠さない）
  await setSlider('媒質1の速さ', 1.0); await setSlider('媒質2の速さ', 2.0); await setSlider('入射角', 70);
  await page.waitForTimeout(250);
  const totText = await page.evaluate(() => document.querySelector('.view.show .formula').textContent);
  const icrit = Math.asin(1.0 / 2.0) * 180 / Math.PI;
  check('全反射条件で「屈折波なし（全反射）」と臨界角が既定で出る',
    totText.includes('屈折波なし（全反射）') && totText.includes('臨界角') && totText.includes(icrit.toFixed(1)),
    totText.slice(0, 150));
  await shot(page, 'app-refract2-total-1280.png');
  // 入射角の自動スイープ
  await page.evaluate(() => [...document.querySelectorAll('.view.show .controls label')].find(l => l.textContent.includes('自動で動かす')).querySelector('input').click());
  const sweep = await page.evaluate(async () => {
    const val = () => parseFloat([...document.querySelectorAll('.view.show .controls .ctl')].find(c => c.textContent.includes('入射角')).querySelector('input[type=range]').value);
    const a = val(); const seen = new Set();
    for (let k = 0; k < 24; k++) { await new Promise(r => setTimeout(r, 120)); seen.add(val()); }
    return { a, n: seen.size, max: Math.max(...seen), min: Math.min(...seen) };
  });
  check('入射角の自動スイープで i が連続に変わる', sweep.n >= 8 && sweep.max - sweep.min >= 10, JSON.stringify(sweep));
  await page.evaluate(() => [...document.querySelectorAll('.view.show .controls label')].find(l => l.textContent.includes('自動で動かす')).querySelector('input').click());
  await setSlider('媒質1の速さ', 1.5); await setSlider('媒質2の速さ', 1.0); await setSlider('入射角', 50);
  await page.waitForTimeout(400);
  await shot(page, 'app-refract2-1280.png');

  /* ---------- 5. 17 回折 ---------- */
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
  await setSlider('スリット幅', 6); await setSlider('波源の周期', 28);   // v=0.50 → λ = vT = 14 セル
  await page.waitForTimeout(4000);
  const narrow = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-narrow-1280.png');
  await setSlider('スリット幅', 56); await setSlider('波源の周期', 12);  // λ = 6 セル
  await page.waitForTimeout(4000);
  const wide = await page.evaluate(() => window.__nami_debug.probe());
  await shot(page, 'app-diffract-wide-1280.png');
  const rn = narrow.behindOff / narrow.behindAxis, rw = wide.behindOff / wide.behindAxis;
  check('w≲λ の方が軸外へ回り込む割合が大きい', rn > rw, `narrow(w/λ=0.43)=${rn.toFixed(3)} > wide(w/λ=9.3)=${rw.toFixed(3)}`);
  // 二重スリット
  await page.selectOption('.view.show .controls select', 'double');
  await setSlider('スリット幅', 8); await setSlider('波源の周期', 24);   // λ = 12 セル
  await page.waitForTimeout(4500);
  await shot(page, 'app-diffract-double-1280.png');
  // リセット
  await page.evaluate(() => [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('リセット')).click());
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__nami_debug.probe());
  check('リセットで場がゼロクリアされる', after.step < 30 && after.front < 0.2, JSON.stringify({ step: after.step, front: +after.front.toFixed(3) }));
  await page.selectOption('.view.show .controls select', 'single');
  await setSlider('スリット幅', 24); await setSlider('波源の周期', 24);

  /* ---------- 6. 18 干渉 ---------- */
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

  /* ---------- 7. スマホ幅 ---------- */
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
  for (const id of ['huygens', 'reflect', 'refract', 'refract2', 'interfere']) {
    await page2.goto(U + '#' + id);
    await page2.waitForTimeout(900);
    await shot(page2, 'app-' + id + '-400.png');
  }
  check('スマホ幅でもエラーなし', errors2.length === 0, errors2.join(' | '));

  check('全操作後もコンソールエラー0', errors.length === 0, errors.join(' | '));
  console.log('\nfps: huygens=' + fpsH + ' reflect=' + fpsRL + ' refract=' + fpsR + ' diffract=' + fpsD + ' interfere=' + fpsI + ' mobile-diffract=' + fpsM);

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
