// なみラボ applied.html「19 音の干渉（クインケ管）」自動検証（旧 おとラボ quincke.html から移植）
// 実行: node test-quincke.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8172;
const ROOT = path.resolve(__dirname, '..'); // D:/claude_projects
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); }
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const f = path.join(ROOT, u.replace(/^\//, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(PORT);
  const OUT = path.join(__dirname, 'test-results'); fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const base = `http://127.0.0.1:${PORT}/nami-lab/applied.html`;

  for (const mode of ['dark', 'proj']) {
    for (const [W, H] of [[1280, 800], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      const tag = `${mode}-${W}`;
      await page.goto(`${base}?mode=${mode}#quincke`);
      await page.waitForTimeout(900);
      check(`[${tag}] タブ quincke が表示`, (await page.locator('nav.tabs button.active').textContent()).includes('クインケ'));
      check(`[${tag}] モード ${mode}`, (await page.evaluate(() => document.documentElement.dataset.mode)) === mode);
      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
      check(`[${tag}] 横スクロールなし`, ov.sw <= ov.iw && ov.bw <= ov.iw, JSON.stringify(ov));
      check(`[${tag}] キャンバス3枚`, (await page.locator('.view.show canvas').count()) === 3);
      if (W === 390) { // 縦積み順: 管 → y-t → 振幅グラフ → 操作
        const ord = await page.evaluate(() => [...document.querySelectorAll('.view.show .panel, .view.show .controls:not(.detail)')].map(e => Math.round(e.getBoundingClientRect().top)));
        check(`[${tag}] 縦積み順（管→y-t→振幅→操作）`, ord.every((v, i) => i === 0 || v > ord[i - 1]), ord.join(','));
      }
      await page.screenshot({ path: path.join(OUT, `quincke-${tag}-initial.png`), fullPage: true });

      // ドラッグ: 取っ手を下へ
      await page.evaluate(() => window.__qk.setD(0));
      const before = await page.evaluate(() => ({ d: window.__qk.st.d, n: window.__qk.recCount(), ro: document.querySelector('.view.show .ro').textContent }));
      const hp = await page.evaluate(() => window.__qk.handlePx());
      await page.mouse.move(hp.x, hp.y); await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(hp.x, hp.y + i * (W > 500 ? 6 : 4));
      await page.mouse.up(); await page.waitForTimeout(250);
      const after = await page.evaluate(() => ({ d: window.__qk.st.d, n: window.__qk.recCount(), ro: document.querySelector('.view.show .ro').textContent, sl: document.querySelectorAll('.view.show .controls input[type=range]')[1].value }));
      check(`[${tag}] 取っ手ドラッグで d が増える`, after.d > before.d + 3, `${before.d} → ${after.d.toFixed(2)}`);
      check(`[${tag}] 読み出しが変わる`, after.ro !== before.ro, after.ro.slice(0, 80));
      check(`[${tag}] d スライダーが同期`, Math.abs(parseFloat(after.sl) - after.d) < 0.06, after.sl);
      check(`[${tag}] 振幅-d グラフに記録が増える`, after.n > before.n + 20, `${before.n} → ${after.n}`);
      // 削除した説明文が画面に無い
      { const txt = await page.evaluate(() => document.body.innerText);
        const banned = ['隣り合う密の位置', '画面クリックで停止', '※', 'なぜ？', '数えてみよう', 'ドラッグして'];
        const hit = banned.filter(b => txt.includes(b));
        check(`[${tag}] 削除した説明文が無い`, hit.length === 0, hit.join(','));
        check(`[${tag}] 凡例・読み出しは残る`, txt.includes('経路差 ΔL') && txt.includes('λ = v/f')); }
      // ΔL 目盛り: f=1000 Hz で「λ」が d=17 cm・f を変えると移る・線間 4px 以上
      { const tk = await page.evaluate(async () => {
          const q = window.__qk, wait = () => new Promise(r => setTimeout(r, 120)), out = {};
          const pick = () => q.dlTicks.map(t => ({ ...t }));
          q.setF(1000); await wait(); out.a = pick();
          q.setF(1500); await wait(); out.b = pick(); out.lamB = q.lam();
          q.setF(3000); await wait(); out.c = pick();
          q.setF(1000); await wait();
          return out;
        });
        const l1 = tk.a.find(t => t.label === 'λ'), l2 = tk.a.find(t => t.label === '2λ'), h1 = tk.a.find(t => t.label === 'λ/2');
        check(`[${tag}] f=1000Hz で「λ」目盛りが d=17 cm`, l1 && near(l1.d, 17, 1e-9) && l1.major, JSON.stringify(l1));
        check(`[${tag}] f=1000Hz で「λ/2」が d=8.5・「2λ」は d=34>dMax で無し`, h1 && near(h1.d, 8.5, 1e-9) && !h1.major && !l2, JSON.stringify(tk.a.map(t => t.label + '@' + t.d)));
        const lb = tk.b.find(t => t.label === 'λ');
        check(`[${tag}] f=1500Hz で「λ」目盛りが d=λ/2 へ移る`, lb && near(lb.d, tk.lamB / 2, 1e-9) && Math.abs(lb.py - l1.py) > 20, JSON.stringify(lb));
        const gaps = tk.c.slice(1).map((t, i) => Math.abs(t.py - tk.c[i].py));
        check(`[${tag}] f=3000Hz でも目盛り線の間隔 ≥ 4px`, gaps.length > 0 && Math.min(...gaps) >= 4, 'min ' + Math.min(...gaps).toFixed(1) + 'px n=' + tk.c.length); }
      await page.screenshot({ path: path.join(OUT, `quincke-${tag}-dlticks.png`), fullPage: false });
      if (errors.length === 0 && mode === 'dark' && W === 1280) {
        // 物理量チェック
        const phys = await page.evaluate(() => {
          const q = window.__qk, out = {};
          q.setF(1000); q.st.v = 340;
          out.lam = q.lam();
          q.setD(0); out.r0 = q.ratio(); out.eq = q.L2() - q.L1();
          q.setD(8.5); out.r85 = q.ratio(); out.dl85 = q.dL();
          q.setD(17); out.r17 = q.ratio();
          q.setD(4.25); out.r425 = q.ratio();
          q.setF(500); q.setD(17); out.r500 = q.ratio();
          q.setF(1000); q.setD(10);
          return out;
        });
        check('λ = v/f = 34.0 cm（f=1000 Hz, v=340 m/s）', near(phys.lam, 34, 1e-9), phys.lam);
        check('d=0 で L₁ = L₂・振幅 1', near(phys.eq, 0) && near(phys.r0, 1), JSON.stringify([phys.eq, phys.r0]));
        check('d=8.5 cm → ΔL=17 cm=λ/2 → 振幅 0', near(phys.dl85, 17) && phys.r85 < 1e-9, phys.r85);
        check('d=17 cm → ΔL=λ → 振幅 1', near(phys.r17, 1, 1e-9), phys.r17);
        check('d=4.25 cm → 振幅 |cos(π/4)|', near(phys.r425, Math.SQRT1_2, 1e-9), phys.r425);
        check('f=500 Hz, d=17 cm → ΔL=λ/2 → 振幅 0', phys.r500 < 1e-9, phys.r500);
        await page.waitForTimeout(200);
        const ro = await page.evaluate(() => document.querySelector('.view.show .ro').textContent);
        check('読み出し 経路差 = 0.59 λ（d=10 cm）', ro.includes('0.59') && ro.includes('20.0'), ro);
        check('判定ラベル（強め合い/弱め合い）を出していない', !(await page.evaluate(() => /強め合い|弱め合い/.test(document.body.innerText))));
        // f を変えると記録がリセット
        await page.evaluate(() => { const r = document.querySelectorAll('.view.show .controls input[type=range]')[0]; r.value = 1200; r.dispatchEvent(new Event('input')); });
        check('f を変えると記録リセット', (await page.evaluate(() => window.__qk.recCount())) === 1);
        // 自動で引き出す
        await page.evaluate(() => [...document.querySelectorAll('.view.show .controls button')].find(b => b.textContent === '自動で引き出す').click());
        await page.waitForTimeout(2500);
        const au = await page.evaluate(() => ({ d: window.__qk.st.d, n: window.__qk.recCount() }));
        check('自動で引き出す → d が増え記録が伸びる', au.d > 3 && au.n > 30, JSON.stringify(au));
        await page.screenshot({ path: path.join(OUT, `quincke-${tag}-sweep.png`), fullPage: true });
        await page.evaluate(() => [...document.querySelectorAll('.view.show .controls button')].find(b => b.textContent === '止める').click());
        await page.evaluate(() => [...document.querySelectorAll('.view.show .controls button')].find(b => b.textContent === 'グラフを消す').click());
        check('グラフを消す', (await page.evaluate(() => window.__qk.recCount())) === 1);
        // 音: ユーザー操作で ON → 音量に比例 → 停止
        const lab = page.locator('.view.show .controls label', { hasText: '音を鳴らす' });
        await lab.click(); await page.waitForTimeout(300);
        const s1 = await page.evaluate(() => ({ on: window.__qk.snd.on, osc: !!window.__qk.snd.osc }));
        check('音を鳴らす ON で発振', s1.on && s1.osc, JSON.stringify(s1));
        await page.evaluate(() => { const q = window.__qk; q.setD(q.lam() / 4); });
        await page.waitForTimeout(300);
        check('弱め合う d で目標音量 0', await page.evaluate(() => window.__qk.snd.gain.gain.value < 0.005));
        await page.getByRole('button', { name: '■ 音を止める' }).click(); await page.waitForTimeout(150);
        check('■ 音を止める で停止', await page.evaluate(() => !window.__qk.snd.on && !window.__qk.snd.osc));
        // 詳しく
        await page.evaluate(() => document.querySelector('.view.show .detailBtn').click()); await page.waitForTimeout(150);
        check('詳しくに音速 v', await page.evaluate(() => { const d = document.querySelector('.view.show .controls.detail'); return !d.hidden && d.textContent.includes('音速'); }));
        await page.evaluate(() => { const q = window.__qk; q.setF(1000); q.setD(5); });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `quincke-${tag}-detail.png`), fullPage: true });
        // クリックで停止
        const cb = await page.locator('.view.show canvas').nth(1).boundingBox();
        await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.waitForTimeout(200);
        check('キャンバスクリックで停止', (await page.evaluate(() => document.querySelector('.view.show .status').textContent)).includes('停止'));
      }
      if (mode === 'proj' && W === 1280) { await page.evaluate(() => window.__qk.setD(12)); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `quincke-${tag}-d12.png`), fullPage: true }); }
      check(`[${tag}] console error / pageerror 0`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }
  await browser.close(); server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
