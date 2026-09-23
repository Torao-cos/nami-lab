// なみラボ ページC（longitudinal.html）自動検証
// 実行: node test-longitudinal.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8137;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(__dirname, rel);
    if (!file.startsWith(__dirname) || !fs.existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  }).listen(PORT);

  const outDir = path.join(__dirname, 'test-results');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const newPage = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    return page;
  };
  const url = h => `http://127.0.0.1:${PORT}/longitudinal.html${h}`;

  /* ---------- 1280 幅 ---------- */
  const page = await newPage(1280, 900);

  // --- タブ6 ---
  await page.goto(url('#lt'));
  await page.waitForTimeout(1200);
  check('#lt で「6 縦波と横波」タブが有効', await page.textContent('nav.tabs button.active') === '6 縦波と横波');
  check('タブが3つ', await page.locator('nav.tabs button').count() === 3);
  check('キャンバス2枚（横波・縦波）が可視', await page.locator('.view.show .panel:not([hidden]) canvas').count() === 2);
  await page.screenshot({ path: path.join(outDir, 'long-lt-1280.png'), fullPage: true });

  // クリックで停止表示
  const cvBox = await page.locator('.view.show canvas').first().boundingBox();
  await page.mouse.click(cvBox.x + cvBox.width * 0.5, cvBox.y + cvBox.height * 0.5);
  await page.waitForTimeout(250);
  const statusTxt = await page.locator('.view.show .status:not([hidden])').first().textContent();
  check('キャンバスクリックで停止表示', /停止中/.test(statusTxt || ''), statusTxt);
  const t1 = await page.locator('.view.show .tval').textContent();
  await page.waitForTimeout(400);
  const t2 = await page.locator('.view.show .tval').textContent();
  check('停止中は t が進まない', t1 === t2, `${t1} → ${t2}`);
  await page.mouse.click(cvBox.x + cvBox.width * 0.5, cvBox.y + cvBox.height * 0.5);
  await page.waitForTimeout(300);
  check('再クリックで再開', (await page.locator('.view.show .tval').textContent()) !== t2);

  // 表示モード切替（横波のみ／縦波のみ）
  await page.selectOption('.view.show .controls select', 'trans');
  await page.waitForTimeout(300);
  check('「横波」モードでキャンバス1枚', await page.locator('.view.show .panel:not([hidden]) canvas').count() === 1);
  await page.selectOption('.view.show .controls select', 'long');
  await page.waitForTimeout(300);
  check('「縦波」モードでキャンバス1枚', await page.locator('.view.show .panel:not([hidden]) canvas').count() === 1);
  await page.screenshot({ path: path.join(outDir, 'long-lt-longonly-1280.png'), fullPage: true });
  await page.selectOption('.view.show .controls select', 'both');
  await page.waitForTimeout(300);

  // --- タブ8 ---
  await page.goto(url('#ltgraph'));
  await page.waitForTimeout(1200);
  check('#ltgraph で「8 縦波の横波表示」タブが有効', await page.textContent('nav.tabs button.active') === '8 縦波の横波表示');
  check('4段（キャンバス4枚）', await page.locator('.view.show .panel canvas').count() === 4);

  // 疎密ラベル位置 ⇔ ∂ξ/∂x の極値
  const lab = await page.evaluate(() => {
    const d = window.__nami_debug.ltg;
    const scan = (sign) => {              // sign=-1: ∂ξ/∂x 最小（密） / +1: 最大（疎）
      const out = []; let prev = d.dxi(0), prev2 = null;
      for (let i = 1; i <= 8000; i++) {
        const x = 8 * i / 8000, cur = d.dxi(x);
        if (prev2 != null) {
          const xm = 8 * (i - 1) / 8000;
          if (sign < 0 && prev < prev2 && prev < cur) out.push(xm);
          if (sign > 0 && prev > prev2 && prev > cur) out.push(xm);
        }
        prev2 = prev; prev = cur;
      }
      return out;
    };
    return { dense: d.dense, rare: d.rare, denseCalc: scan(-1), rareCalc: scan(1), lambda: d.lambda, rev: d.rev };
  });
  const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < tol);
  check('「密」ラベルが ∂ξ/∂x の最小点と一致（±0.01 m）',
    near(lab.dense, lab.denseCalc, 0.01), `label=[${lab.dense.map(v => v.toFixed(3))}] calc=[${lab.denseCalc.map(v => v.toFixed(3))}]`);
  check('「疎」ラベルが ∂ξ/∂x の最大点と一致（±0.01 m）',
    near(lab.rare, lab.rareCalc, 0.01), `label=[${lab.rare.map(v => v.toFixed(3))}] calc=[${lab.rareCalc.map(v => v.toFixed(3))}]`);

  // 疎密ラベルの「理由」＝はさむ2つの玉が向かい合う（密）／離れる（疎）ことを強調している
  const fl = await page.evaluate(() => {
    const d = window.__nami_debug.ltg, f = d.flank;
    const ok = (pairs, inward) => pairs.every(([i, j]) => {
      const a = d.xi(f.xs[i]), b = d.xi(f.xs[j]);       // 右向き正の変位
      return inward ? (a > 1e-6 && b < -1e-6) : (a < -1e-6 && b > 1e-6);
    });
    return { nD: f.d.length, nR: f.r.length, dOk: ok(f.d, true), rOk: ok(f.r, false) };
  });
  check('「密」をはさむ2つの玉が向かい合う向きにずれている', fl.nD > 0 && fl.dOk, JSON.stringify(fl));
  check('「疎」をはさむ2つの玉が離れる向きにずれている', fl.nR > 0 && fl.rOk, JSON.stringify(fl));

  // 「90°回す」手順の理由が同じ画面にある
  const ltgNotes = (await page.locator('.view.show .controls .note').allTextContents()).join(' ');
  check('回転の理由（写し替えているだけ）が画面にある', /写し替え/.test(ltgNotes) && /長さ/.test(ltgNotes), ltgNotes.slice(0, 60) + '…');
  check('疎密ラベルの理由（両側から寄ってくる）が画面にある', /寄って/.test(ltgNotes), ltgNotes.slice(0, 60) + '…');

  // 矢印を回す
  await page.click('.view.show .controls button.primary');
  await page.waitForTimeout(1700);
  const rot = await page.evaluate(() => window.__nami_debug.ltg.rot);
  check('「矢印を回す」で回転が90°に到達', Math.abs(rot - 90) < 0.01, 'rot=' + rot);
  await page.screenshot({ path: path.join(outDir, 'long-ltgraph-1280.png'), fullPage: true });

  // 正の向き反転（詳しく）— 時刻を止めてから比較する
  const cvBox2 = await page.locator('.view.show canvas').first().boundingBox();
  await page.mouse.click(cvBox2.x + cvBox2.width * 0.5, cvBox2.y + cvBox2.height * 0.5);
  await page.waitForTimeout(300);
  await page.click('.view.show .timebar .detailBtn');
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => { const d = window.__nami_debug.ltg; return { dense: d.dense, sgn: d.sgn, y: d.xi(1.0) }; });
  await page.click('.view.show .controls.detail button');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => { const d = window.__nami_debug.ltg; return { dense: d.dense, sgn: d.sgn, rev: d.rev }; });
  check('正の向き反転で横波表示の符号が反転', after.sgn === -before.sgn, `${before.sgn} → ${after.sgn}`);
  check('反転しても疎密ラベルの x は動かない',
    near(after.dense, before.dense, 1e-9), `${before.dense.map(v => v.toFixed(3))} / ${after.dense.map(v => v.toFixed(3))}`);
  await page.click('.view.show .controls.detail button');   // 元に戻す

  // --- タブ7 ---
  await page.goto(url('#seismic'));
  await page.waitForTimeout(3500);
  check('#seismic で「7 地震のP波・S波」タブが有効', await page.textContent('nav.tabs button.active') === '7 地震のP波・S波');
  const sh = await page.evaluate(() => window.__nami_debug && window.__nami_debug.shadow);
  check('シャドーゾーンが計算されている', !!sh, JSON.stringify(sh));
  if (sh) {
    console.log(`  → 計算値: P ${sh.pStart.toFixed(2)}° 〜 ${sh.pEnd.toFixed(2)}° / S ${sh.sStart.toFixed(2)}° 以遠（震源の深さ ${sh.depth} km）`);
    // PREM をそのまま使った波線（射線）計算の値。教科書の 103° は回折波を含む観測値なので一致しないのが正しい。
    // 受け入れ条件は「PREM の物理的に正しい値であること」＋「ずれの理由が画面に書いてあること」（SPEC §4-7 の読み替え）。
    check('P 直達の限界が PREM の値（96〜100°）', sh.pStart > 96 && sh.pStart < 100, `${sh.pStart.toFixed(2)}°`);
    check('PKP が戻る最小角距離が PREM の値（142〜148°）', sh.pEnd > 142 && sh.pEnd < 148, `${sh.pEnd.toFixed(2)}°`);
    check('S シャドーゾーン開始 103° ±3°', Math.abs(sh.sStart - 103) <= 3, `${sh.sStart.toFixed(2)}° (差 ${(sh.sStart - 103).toFixed(2)}°)`);
  }
  // 「計算値と教科書値の差の理由」が画面に出ていること（SPEC §4-7 読み替えの本体）
  const whyTxt = (await page.locator('.view.show .controls .note').allTextContents()).join(' ');
  check('計算値と教科書値のずれの理由が画面にある', /103/.test(whyTxt) && /回折/.test(whyTxt) && /波線/.test(whyTxt),
    whyTxt.slice(0, 80) + '…');
  check('計算値そのものが理由の文中に出る', sh ? whyTxt.includes(sh.pStart.toFixed(1)) : false);
  // 波線を1本も途中で捨てていないこと（P は必ず地表へ／S は地表か外核境界で終わる）
  const rays = await page.evaluate(() => window.__nami_debug.rays);
  const pBad = rays.P.filter(r => r.end !== 'surface');
  const sBad = rays.S.filter(r => r.end !== 'surface' && r.end !== 'cmb');
  check('P の波線がすべて地表まで届く（途中で消えない）', pBad.length === 0, `本数=${rays.P.length} 例外=${JSON.stringify(pBad)}`);
  check('S の波線は地表か外核境界でだけ終わる', sBad.length === 0, `本数=${rays.S.length} 例外=${JSON.stringify(sBad)}`);
  check('内核を通る P（PKIKP・PKiKP）も描いている', rays.P.some(r => r.inner), `内核を通る波線=${rays.P.filter(r => r.inner).length} 本`);
  // 帯と波線の到達点が画面上で矛盾しないこと（弱い P 以外は帯の中に落ちない）
  if (sh) {
    const inBandP = rays.P.filter(r => r.end === 'surface' && !r.inner && r.d > sh.pStart + 1e-6 && r.d < sh.pEnd - 1e-6);
    const inBandS = rays.S.filter(r => r.end === 'surface' && r.d > sh.sStart + 1e-6);
    check('P の帯の中に「弱い P」以外の到達点がない', inBandP.length === 0, JSON.stringify(inBandP.map(r => +r.d.toFixed(1))));
    check('S の帯の中に S の到達点がない', inBandS.length === 0, JSON.stringify(inBandS.map(r => +r.d.toFixed(1))));
  }
  // 文言
  const seisTxt = await page.locator('.view.show').first().innerText();
  check('「地震発生からの時間」の表現になっている', /地震発生からの時間/.test(seisTxt) && !/地震の時刻/.test(seisTxt));
  check('再生速度が「画面の1秒＝実際の○秒」で説明されている', /再生速度/.test(seisTxt) && /画面の1秒＝実際の60秒/.test(seisTxt));

  const obs = await page.locator('.view.show .controls .readout').nth(1).textContent();
  check('観測点の読み出しに Δ と P・S 到達が出る', /Δ =/.test(obs) && /P到達/.test(obs), obs);
  const ps = await page.locator('.view.show .controls .readout').nth(2).textContent();
  check('初期微動継続時間（S−P）が表示される', /s$/.test(ps.trim()), ps);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, 'long-seismic-1280.png'), fullPage: true });

  // コマ送り・スロー・リセット・時間スクラブ（タブ7）
  const tv = () => page.locator('.view.show .tval').textContent();
  await page.click('.view.show .timebar button:nth-child(1)');          // 停止
  await page.waitForTimeout(200);
  const tStop = await tv();
  await page.click('.view.show .timebar button:nth-child(3)');          // ▶ コマ送り
  await page.waitForTimeout(200);
  const tFwd = parseFloat((await tv()).replace(/[^0-9.]/g, ''));
  // 既定の再生速度 ×60 では period = 1800/60 = 30 s → 1コマ = 2.5 s（地震の時刻で 150 s）
  check('タブ7 コマ送り ▶ が period/12 = 2.5 s 進む', Math.abs(tFwd - (parseFloat(tStop.replace(/[^0-9.]/g, '')) + 2.5)) < 0.01, `${tStop} → ${tFwd}`);
  await page.click('.view.show .timebar button:nth-child(2)');          // ◀
  await page.waitForTimeout(200);
  check('タブ7 コマ送り ◀ で元に戻る', (await tv()) === tStop, `${tStop} vs ${await tv()}`);
  await page.selectOption('.view.show .timebar select', '0.25');
  await page.click('.view.show .timebar button:nth-child(1)');          // 再開（×1/4）
  await page.waitForTimeout(900);
  const slowDt = parseFloat((await tv()).replace(/[^0-9.]/g, '')) - parseFloat(tStop.replace(/[^0-9.]/g, ''));
  check('タブ7 スロー ×1/4 が効く（0.9秒で約0.22秒ぶん）', slowDt > 0.05 && slowDt < 0.45, 'Δt=' + slowDt.toFixed(3));
  await page.click('.view.show .timebar button:nth-child(5)');          // リセット
  await page.waitForTimeout(200);
  check('タブ7 リセットで t=0', /0\.0/.test(await tv()), await tv());
  await page.selectOption('.view.show .timebar select', '1');
  // 時間スクラブ（停止して過去の時刻へ）
  await page.click('.view.show .timebar button:nth-child(1)');
  await page.evaluate(() => { const r = document.querySelector('.view.show .timebar input[type=range]'); r.value = 5; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  check('タブ7 時間スクラブで任意時刻へ', /5\.0/.test(await tv()), await tv());
  await page.evaluate(() => { const r = document.querySelector('.view.show .timebar input[type=range]'); r.value = 3; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  check('タブ7 過去へ戻れる', /3\.0/.test(await tv()), await tv());
  await page.click('.view.show .timebar button:nth-child(1)');          // 再開

  // fps 相当（描画が止まっていないこと）
  const ta = await page.locator('.view.show .tval').textContent();
  await page.waitForTimeout(700);
  const tb = await page.locator('.view.show .tval').textContent();
  check('タブ7でアニメーションが進む', ta !== tb, `${ta} → ${tb}`);

  // 再生速度（既定 ×60／最大 ×600。速度を変えても「地震発生からの時間」は保たれる）
  await page.click('.view.show .timebar button:nth-child(1)');
  await page.waitForTimeout(200);
  const tB = parseFloat((await tv()).replace(/[^0-9.]/g, ''));
  await page.evaluate(() => { const rs = [...document.querySelectorAll('.view.show .controls:not(.detail) input[type=range]')]; const r = rs[1]; r.value = 3; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  const tA = parseFloat((await tv()).replace(/[^0-9.]/g, ''));
  check('再生速度 ×60→×600 で地震発生からの時間が保たれる', Math.abs(tA - tB / 10) < 0.02, `t: ${tB} → ${tA}`);
  const spTxt = await page.locator('.view.show .controls:not(.detail)').first().innerText();
  check('再生速度の最大が ×600（意味つき表示）', /×600（画面の1秒＝実際の600秒）/.test(spTxt), spTxt.slice(0, 60));

  await page.close();

  /* ---------- 400 幅（スマホ縦持ち） ---------- */
  const sp = await newPage(400, 900);
  await sp.goto(url('#seismic'));
  await sp.waitForTimeout(3500);
  const ov = await sp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('幅400で横スクロールが出ない', ov.sw <= ov.cw + 1, JSON.stringify(ov));
  await sp.screenshot({ path: path.join(outDir, 'long-seismic-400.png'), fullPage: true });
  await sp.goto(url('#ltgraph'));
  await sp.waitForTimeout(1200);
  const ov2 = await sp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('幅400・タブ8で横スクロールが出ない', ov2.sw <= ov2.cw + 1, JSON.stringify(ov2));
  await sp.close();

  check('コンソールエラー0', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();

  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} PASS`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
