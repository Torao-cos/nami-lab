// なみラボ sound.html「20 正弦波の合成」自動検証（旧 おとラボ combine.html から移植）
// 実行: node test-combine.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8171;
const ROOT = path.resolve(__dirname, '..');   // D:/claude_projects
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const f = path.join(ROOT, u.replace(/^\//, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(PORT);

  const OUT = path.join(__dirname, 'test-results');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${PORT}/nami-lab/sound.html`;

  async function open(mode, w, h, hash = '#combine') {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(`${base}?mode=${mode}${hash}`);
    await page.waitForTimeout(800);
    return { ctx, page, errors };
  }
  const noHScroll = page => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));

  const stopPlay = page => page.evaluate(() => { if (window.__cmb_debug.sim.running) document.querySelector('.view.show .timebar button').click(); });
  const playOn = page => page.evaluate(() => { if (!window.__cmb_debug.sim.running) document.querySelector('.view.show .timebar button').click(); });
  const SUBS = ['₁', '₂', '₃'];

  // ---------- 1. 全モード×サイズ×横軸 ----------
  for (const mode of ['dark', 'proj']) {
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      const { ctx, page, errors } = await open(mode, w, h);
      const ax0 = await page.evaluate(() => window.__cmb_debug.St.axis);
      check(`${mode} ${w} 既定の横軸は時刻 t`, ax0 === 't', ax0);
      for (const axis of ['t', 'x']) {
        await page.evaluate(a => window.__cmb_debug.setAxis(a), axis);
        await page.evaluate(() => window.__cmb_debug.preset('p123'));
        await playOn(page);
        await page.waitForTimeout(300);
        // 再生中にレイアウト高さが変わらない
        const hs = [];
        for (let k = 0; k < 12; k++) {
          hs.push(await page.evaluate(() => [document.documentElement.scrollHeight, document.querySelector('.view.show .controls').offsetHeight, document.querySelector('.view.show .timebar').offsetHeight].join(',')));
          await page.waitForTimeout(90);
        }
        check(`${mode} ${w} 横軸${axis} 再生中にレイアウト高さ不変`, new Set(hs).size === 1, [...new Set(hs)].join(' / '));
        const o = await noHScroll(page);
        check(`${mode} ${w}x${h} 横軸${axis} 横スクロールなし`, o.sw <= o.iw && o.bw <= o.iw, JSON.stringify(o));
        await stopPlay(page);
        await page.evaluate(() => window.__cmb_debug.sim.setT(0.6));
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(OUT, `combine-${mode}-${w}-${axis}.png`), fullPage: true });
      }
      check(`${mode} ${w}x${h} console error・pageerror 0`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }

  // ---------- 2. 操作（1280 手元） ----------
  {
    const { ctx, page, errors } = await open('dark', 1280, 800);
    const dbg = (fn, arg) => page.evaluate(fn, arg);
    check('タブ5つ（20〜24）', (await page.locator('nav.tabs button').count()) === 5);
    check('canvas 2枚（上段・下段）', (await page.locator('.view.show canvas').count()) === 2);
    const def = await dbg(() => ({ on: window.__cmb_debug.St.on.slice(), checks: [...document.querySelectorAll('.view.show .wave-row input[type=checkbox]')].map(c => c.checked) }));
    check('既定: y₁・y₂ ON、y₃ OFF（チェックも一致）', JSON.stringify(def.on) === '[true,true,false]' && JSON.stringify(def.checks) === '[true,true,false]', JSON.stringify(def));
    const txt = await page.evaluate(() => document.body.innerText);
    check('うなり・スローモーション等の文言なし', !/うなり|包絡線|破線が 0|スロー|ドラッグ/.test(txt));
    await stopPlay(page);
    await page.waitForTimeout(200);
    const boxU = await page.locator('.view.show canvas').nth(0).boundingBox();
    const sh = await dbg(() => { const d = window.__cmb_debug; return [d.cvU.px(0.5), d.cvL.px(0.5), d.cvU.px(2.5), d.cvL.px(2.5)]; });
    check('上下段で横軸の目盛り位置が同じ', Math.abs(sh[0] - sh[1]) < 0.5 && Math.abs(sh[2] - sh[3]) < 0.5, JSON.stringify(sh));

    // 合成値: 入っている波だけの和（チェック ON/OFF で変わる）
    await dbg(() => { const d = window.__cmb_debug; d.preset('p123'); d.sim.setT(0.37); });
    await page.waitForTimeout(150);
    const f2 = v => (Math.abs(v) < 5e-3 ? 0 : v).toFixed(2).replace('-', '−');
    const sumOf = () => dbg(() => {
      const d = window.__cmb_debug, S = d.St, t = d.cursor();
      const e = [0, 1, 2].map(i => S.A[i] * Math.sin(2 * Math.PI * S.f[i] * (t - S.st[i])));
      const exp = e.reduce((s, v, i) => s + (S.on[i] ? v : 0), 0);
      return { e, exp, got: d.ysum(t), ro: document.querySelector('.view.show .readout').textContent, on: S.on.slice() };
    });
    const a3 = await sumOf();
    check('3本 ON: y = y₁ + y₂ + y₃（式どおり）', Math.abs(a3.exp - a3.got) < 1e-12 && Math.abs(a3.exp - (a3.e[0] + a3.e[1] + a3.e[2])) < 1e-12, `${a3.got}`);
    check('3本 ON: 読み出しに y₃ と合成値', a3.ro.includes('y₃ = ' + f2(a3.e[2])) && a3.ro.includes('y = ' + f2(a3.exp) + ' m'), a3.ro);
    await page.locator('.view.show .wave-row').nth(1).locator('input[type=checkbox]').uncheck();
    await page.waitForTimeout(150);
    const a13 = await sumOf();
    check('y₂ のチェックを外す → 合成から y₂ が抜ける', !a13.on[1] && Math.abs(a13.got - (a13.e[0] + a13.e[2])) < 1e-12 && Math.abs(a13.got - a3.got) > 1e-3, `${a3.got.toFixed(3)} → ${a13.got.toFixed(3)}`);
    check('y₂ OFF: 読み出しから y₂ が消える', !a13.ro.includes('y₂') && a13.ro.includes('y = ' + f2(a13.exp) + ' m'), a13.ro);
    check('y₂ OFF: 下段タイトル y = y₁ + y₃', (await page.locator('.view.show .panel').nth(1).textContent()).includes('y = y₁ + y₃'));
    await page.screenshot({ path: path.join(OUT, 'combine-dark-1280-y2off.png'), fullPage: true });
    await page.locator('.view.show .wave-row').nth(1).locator('input[type=checkbox]').check();
    await page.waitForTimeout(100);
    check('操作でプリセット表示は「自由」', (await page.evaluate(() => document.querySelectorAll('.view.show .controls select')[1].value)) === 'free');

    // スライダー ↔ 数値入力の同期（y₂ の f）
    const row2 = page.locator('.view.show .wave-row').nth(1);
    await row2.locator('input[type=number]').first().fill('2.37');
    await page.waitForTimeout(100);
    const sy1 = await dbg(() => ({ f: window.__cmb_debug.St.f[1], r: document.querySelectorAll('.view.show .wave-row')[1].querySelector('input[type=range]').value }));
    check('数値入力 f₂ = 2.37 → 状態とスライダーが追随', sy1.f === 2.37 && Math.abs(parseFloat(sy1.r) - 2.37) <= 0.025 + 1e-9, JSON.stringify(sy1));
    await dbg(() => { const r = document.querySelectorAll('.view.show .wave-row')[1].querySelector('input[type=range]'); r.value = 3.5; r.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(100);
    const sy2 = await dbg(() => ({ f: window.__cmb_debug.St.f[1], n: document.querySelectorAll('.view.show .wave-row')[1].querySelector('input[type=number]').value }));
    check('スライダー f₂ = 3.5 → 状態と数値入力が追随', sy2.f === 3.5 && sy2.n === '3.5', JSON.stringify(sy2));
    await dbg(() => { const n = document.querySelectorAll('.view.show .wave-row')[2].querySelectorAll('input[type=number]')[2]; n.value = '0.33'; n.dispatchEvent(new Event('input')); });
    const sy3 = await dbg(() => ({ A: window.__cmb_debug.St.A[2], r: document.querySelectorAll('.view.show .wave-row')[2].querySelectorAll('input[type=range]')[2].value }));
    check('数値入力 A₃ = 0.33 → 状態とスライダーに反映', sy3.A === 0.33 && parseFloat(sy3.r) === 0.33, JSON.stringify(sy3));

    // プリセット
    const pre = await dbg(() => {
      const d = window.__cmb_debug, S = d.St, out = {};
      for (const p of ['p1', 'p12', 'p13', 'p123', 'odd', 'harm']) { d.preset(p); out[p] = { on: S.on.slice(), f: S.f.slice(), lam: S.lam.map(v => +v.toFixed(4)), A: S.A.slice(), st: S.st.slice(), T: d.sumPeriod() }; }
      return out;
    });
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    check('プリセット 基本音のみ', eq(pre.p1.on, [true, false, false]) && pre.p1.f[0] === 1, JSON.stringify(pre.p1));
    check('プリセット 基本音＋2倍音', eq(pre.p12.on, [true, true, false]) && eq(pre.p12.f.slice(0, 2), [1, 2]), JSON.stringify(pre.p12));
    check('プリセット 基本音＋3倍音', eq(pre.p13.on, [true, false, true]) && pre.p13.f[2] === 3, JSON.stringify(pre.p13));
    check('プリセット 基本音＋2倍音＋3倍音', eq(pre.p123.on, [true, true, true]) && eq(pre.p123.f, [1, 2, 3]), JSON.stringify(pre.p123));
    check('プリセット 1,3,5 倍（振幅 1, 1/3, 1/5）', eq(pre.odd.f, [1, 3, 5]) && Math.abs(pre.odd.A[1] / pre.odd.A[0] - 1 / 3) < 0.01 && Math.abs(pre.odd.A[2] / pre.odd.A[0] - 1 / 5) < 0.01 && eq(pre.odd.lam, [4, 1.3333, 0.8]), JSON.stringify(pre.odd));
    check('プリセット 1,2,3 倍（振幅 1, 1/2, 1/3）', eq(pre.harm.f, [1, 2, 3]) && Math.abs(pre.harm.A[1] / pre.harm.A[0] - 1 / 2) < 0.01 && Math.abs(pre.harm.A[2] / pre.harm.A[0] - 1 / 3) < 0.01, JSON.stringify(pre.harm));
    check('プリセットでずれは 0', eq(pre.harm.st, [0, 0, 0]));
    check('合成波の周期 = 基本音の周期 1 s（倍音プリセット）', ['p12', 'p13', 'p123', 'odd', 'harm'].every(p => Math.abs(pre[p].T - 1) < 1e-9));
    await page.waitForTimeout(150);
    const prRo = await dbg(() => [...document.querySelectorAll('.view.show .ctl')].find(c => c.textContent.startsWith('合成波の周期')).textContent);
    check('読み出し 合成波の周期 1.00 s', prRo.includes('1.00 s'), prRo);
    const tp = await dbg(() => { const d = window.__cmb_debug; let m = 0; for (let t = 0; t < 2; t += 0.01) m = Math.max(m, Math.abs(d.ysum(t) - d.ysum(t + 1))); return m; });
    check('合成波は 1 s ごとに同じ形', tp < 1e-9, tp.toExponential(2));

    // 縦線ドラッグ（上段・t 軸）
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
    const boxU2 = await page.locator('.view.show canvas').nth(0).boundingBox(); Object.assign(boxU, boxU2);
    await dbg(() => window.__cmb_debug.sim.setT(1.2));
    await page.waitForTimeout(150);
    const lt = await dbg(() => window.__cmb_debug.cvU.px(window.__cmb_debug.cursor()));
    const ro0 = await page.locator('.view.show .readout').first().textContent();
    await page.mouse.move(boxU.x + lt, boxU.y + 30);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(boxU.x + lt + k * 15, boxU.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const ct = await dbg(() => window.__cmb_debug.cursor());
    const ro1 = await page.locator('.view.show .readout').first().textContent();
    check('t 軸で縦線ドラッグ → 縦線の時刻が進む', ct > 1.3, ct.toFixed(2));
    check('縦線ドラッグで読み出しが変わる', ro0 !== ro1);
    const st1 = await page.evaluate(() => document.querySelector('.view.show .status').textContent);
    check('ドラッグ後にクリック誤爆なし（停止のまま）', st1.includes('停止中'), st1);

    // 曲線ドラッグ（3本とも）
    const pickCurve = i => dbg(i => {
      const d = window.__cmb_debug, cv = d.cvU, c = d.cursor();
      const pk = [0, 1, 2].map(k => d.peak(k));
      for (let x = 0.1; x < d.W() - 0.1; x += 0.01) {
        if (Math.abs(cv.px(x) - cv.px(c)) < 40) continue;
        if (pk.some(p => Math.abs(cv.px(p.x) - cv.px(x)) < 40)) continue;
        const Y = [0, 1, 2].map(k => cv.py(d.yi(k, x)));
        if ([0, 1, 2].filter(k => k !== i).every(k => Math.abs(Y[k] - Y[i]) > 35)) return { X: cv.px(x), Y: Y[i], s: d.St.st.slice() };
      }
      return null;
    }, i);
    for (const i of [0, 1, 2]) {
      const pick = await pickCurve(i);
      if (!pick) { check(`y${SUBS[i]} 曲線ドラッグ用の点が見つかる`, false); continue; }
      await page.mouse.move(boxU.x + pick.X, boxU.y + pick.Y);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) await page.mouse.move(boxU.x + pick.X + k * 4, boxU.y + pick.Y);
      await page.waitForTimeout(80);
      if (i === 2) await page.screenshot({ path: path.join(OUT, 'combine-drag-curve.png') });
      await page.mouse.up();
      await page.waitForTimeout(120);
      const s = await dbg(() => window.__cmb_debug.St.st.slice());
      const dxW = await dbg(() => 32 / window.__cmb_debug.cvU.sx);
      const others = [0, 1, 2].filter(k => k !== i).every(k => s[k] === pick.s[k]);
      check(`y${SUBS[i]} の曲線ドラッグでその波だけずれる`, Math.abs(s[i] - pick.s[i] - dxW) < 0.02 && others, `Δt ${pick.s[i].toFixed(3)} → ${s[i].toFixed(3)}（期待 +${dxW.toFixed(3)}）`);
    }
    // 山の点（3本とも）: 上へ → 振幅増・数値入力も追随
    for (const i of [0, 1, 2]) {
      const pk = await dbg(i => { const d = window.__cmb_debug; const q = d.peak(i); return { X: d.cvU.px(q.x), Y: d.cvU.py(q.y), A: d.St.A[i] }; }, i);
      await page.mouse.move(boxU.x + pk.X, boxU.y + pk.Y);
      await page.mouse.down();
      for (let k = 1; k <= 6; k++) await page.mouse.move(boxU.x + pk.X, boxU.y + pk.Y - k * 4);
      await page.mouse.up();
      await page.waitForTimeout(120);
      const A = await dbg(i => ({ A: window.__cmb_debug.St.A[i], n: document.querySelectorAll('.view.show .wave-row')[i].querySelectorAll('input[type=number]')[2].value }), i);
      check(`y${SUBS[i]} の山の点を上へ → 振幅が増え数値入力も追随`, A.A > pk.A + 0.03 && parseFloat(A.n) === A.A, `${pk.A} → ${A.A}（入力 ${A.n}）`);
    }
    // OFF の波は山の点が出ない
    await dbg(() => window.__cmb_debug.toggleOn(2, false));
    await page.waitForTimeout(120);
    check('OFF の y₃ は山の点が出ない', (await dbg(() => window.__cmb_debug.cvU.handles[2].hidden)) === true);

    // x 軸: 再生で合成波の形がそのまま進む
    await dbg(() => { window.__cmb_debug.setAxis('x'); window.__cmb_debug.preset('p123'); });
    await playOn(page);
    await page.waitForTimeout(200); // 横軸の切替が反映されてから測る（直後だと t がまだ前の値で、まれに戻る）
    const tr = await dbg(() => new Promise(r => { const d = window.__cmb_debug; const t0 = d.curT(), y0 = d.ysum(3); setTimeout(() => { const t1 = d.curT(); const dx = d.St.v * (t1 - t0); r({ t0, t1, ok: Math.abs(d.ysum(3 + dx) - y0) < 1e-9 }); }, 400); }));
    check('x 軸で再生 → 合成波の形がそのまま v で右へ進む', tr.t1 > tr.t0 && tr.ok, JSON.stringify(tr));
    const xr = await dbg(() => [...document.querySelectorAll('.view.show .ctl')].find(c => c.textContent.startsWith('合成波の波長')).textContent);
    check('x 軸: 合成波の波長 4.00 m', xr.includes('4.00 m'), xr);
    await dbg(() => { const n = document.querySelectorAll('.view.show .wave-row')[0].querySelectorAll('input[type=number]')[1]; n.value = '3.1'; n.dispatchEvent(new Event('input')); });
    const lam = await dbg(() => ({ v: window.__cmb_debug.St.lam[0], r: document.querySelectorAll('.view.show .wave-row')[0].querySelectorAll('input[type=range]')[1].value }));
    check('x 軸: 数値入力 λ₁ = 3.1 → 状態とスライダーに反映', lam.v === 3.1 && Math.abs(parseFloat(lam.r) - 3.1) < 0.03, JSON.stringify(lam));
    // t 軸: 再生で縦線が右へ進み右端で戻る
    await dbg(() => { window.__cmb_debug.setAxis('t'); window.__cmb_debug.preset('harm'); });
    const run = await dbg(() => new Promise(r => { const d = window.__cmb_debug; const c0 = d.cursor(); setTimeout(() => r({ c0, c1: d.cursor() }), 400); }));
    check('t 軸で再生 → 縦線が右へ進む', run.c1 > run.c0, JSON.stringify(run));
    await dbg(() => window.__cmb_debug.sim.setT(2.97));
    await page.waitForTimeout(300);
    check('t 軸 → 右端で左端へ戻る', (await dbg(() => window.__cmb_debug.cursor())) < 1);
    await dbg(() => window.__cmb_debug.toggleGhost(true));
    await stopPlay(page);
    await dbg(() => window.__cmb_debug.sim.setT(0.62));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, 'combine-dark-1280-t-ghost.png'), fullPage: true });
    check('操作全体で console error 0', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // ---------- 3. 投影モードの操作後スクショ ----------
  {
    const { ctx, page, errors } = await open('proj', 1280, 800);
    await page.evaluate(() => { const d = window.__cmb_debug; d.preset('odd'); document.querySelector('.view.show .timebar button').click(); d.sim.setT(0.62); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'combine-proj-1280-odd.png'), fullPage: true });
    check('投影 1,3,5 倍プリセットで error 0', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
