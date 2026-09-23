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
  await page.waitForFunction(() => window.__nami_debug && window.__nami_debug.seis && window.__nami_debug.seis.frontReady, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  check('#seismic で「7 地震のP波・S波」タブが有効', await page.textContent('nav.tabs button.active') === '7 地震のP波・S波');
  check('レイアウトが side（操作子が右列）', await page.locator('.view.show.side').count() === 1);
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
  // 「計算値と教科書値の差の理由」が画面に出ていること（SPEC §4-7 読み替えの本体。長いので「詳しく」側）
  const whyTxt = (await page.locator('.view.show .controls .note').allTextContents()).join(' ');
  check('計算値と教科書値のずれの理由が画面にある', /103/.test(whyTxt) && /回折/.test(whyTxt) && /波線/.test(whyTxt),
    whyTxt.slice(0, 80) + '…');
  check('計算値そのものが理由の文中に出る', sh ? whyTxt.includes(sh.pStart.toFixed(1)) : false);
  // 既定画面（詳しく以外）の注記は2行以内＝長い説明は「詳しく」へ移してある
  const plainNotes = await page.locator('.view.show .controls:not(.detail) .note').allTextContents();
  check('既定画面の注記は2つ以内', plainNotes.length <= 2, `${plainNotes.length} 件`);
  check('既定画面の注記が短い（2行以内ぶん・合計90字以内）', plainNotes.join('').length <= 90, plainNotes.join(' ／ '));
  check('長い「103°とずれる理由」は既定画面に出ていない', !plainNotes.join(' ').includes('回折'), plainNotes.join(' ').slice(0, 40));

  // --- 波線（道すじ）: 1本も途中で終わらない ---
  const rays = await page.evaluate(() => window.__nami_debug.rays);
  const ER = 6371, R_CMB = 3480;
  const pBad = rays.P.filter(r => r.end !== 'surface');
  const sBad = rays.S.filter(r => r.end !== 'surface' && r.end !== 'cmb');
  check('P の波線がすべて地表まで届く（途中で消えない）', pBad.length === 0, `本数=${rays.P.length} 例外=${JSON.stringify(pBad)}`);
  check('S の波線は地表か外核境界でだけ終わる', sBad.length === 0, `本数=${rays.S.length} 例外=${JSON.stringify(sBad)}`);
  check('内核を通る P（PKIKP・PKiKP）も描いている', rays.P.some(r => r.inner), `内核を通る波線=${rays.P.filter(r => r.inner).length} 本`);
  // 描いている線そのものが地表／外核境界で終わっている（端点の半径で確認）
  const pEndBad = rays.P.filter(r => Math.abs(r.rEnd - ER) > 2);
  const sEndBad = rays.S.filter(r => Math.abs(r.rEnd - ER) > 2 && Math.abs(r.rEnd - R_CMB) > 2);
  check('P の波線の終点が地表（r = 6371 km）にある', pEndBad.length === 0, JSON.stringify(pEndBad.map(r => +r.rEnd.toFixed(1))));
  check('S の波線の終点が地表か外核境界にある', sEndBad.length === 0, JSON.stringify(sEndBad.map(r => +r.rEnd.toFixed(1))));
  // 描画点のとびが小さい＝線が視覚的に途切れない
  const gapBad = [...rays.P, ...rays.S].filter(r => r.maxGap > 220);
  check('波線の描画点のとびが 220 km 以下（線が切れて見えない）', gapBad.length === 0, JSON.stringify(gapBad.map(r => Math.round(r.maxGap))));

  // --- 波面: 細かい射出角で計算し、連続な曲線になっている ---
  const nF = await page.evaluate(() => window.__nami_debug.seis.nFront);
  check('波面は P・S とも 400〜720 本の射出角で計算している', nF.P >= 400 && nF.P <= 720 && nF.S >= 400 && nF.S <= 720, JSON.stringify(nF));
  const fr = await page.evaluate(() => {
    const ER = 6371, R_CMB = 3480, out = [];
    for (const te of [30, 120, 250, 400, 550, 700, 900]) for (const kind of ['P', 'S']) {
      const runs = window.__nami_debug.seis.front(kind, te);
      let solidMax = 0, bridgeMax = 0, badEnds = 0, pts = 0;
      for (const run of runs) {
        pts += run.length;
        for (let i = 1; i < run.length; i++) {
          const g = Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
          if (run[i][2]) bridgeMax = Math.max(bridgeMax, g); else solidMax = Math.max(solidMax, g);
        }
        for (const p of [run[0], run[run.length - 1]]) {         // 端は地表・外核境界・対称軸のどれか
          const r = Math.hypot(p[0], p[1]);
          if (!(Math.abs(r - ER) < 40 || Math.abs(r - R_CMB) < 40 || Math.abs(p[0]) < 300)) badEnds++;
        }
      }
      out.push({ te, kind, runs: runs.length, pts, solidMax, bridgeMax, badEnds });
    }
    return out;
  });
  const frBadGap = fr.filter(f => f.solidMax > 420);
  const frBadEnd = fr.filter(f => f.badEnds > 0);
  const frEmpty = fr.filter(f => f.pts < 30);
  check('波面の隣どうしの点が 420 km 以内（隙間・段差が出ない）', frBadGap.length === 0,
    JSON.stringify(frBadGap.map(f => `${f.kind}@${f.te}s:${Math.round(f.solidMax)}km`)));
  check('波面の端はすべて地表・外核境界・対称軸のどれか', frBadEnd.length === 0,
    JSON.stringify(frBadEnd.map(f => `${f.kind}@${f.te}s:${f.badEnds}`)));
  check('波面が十分な点数でつながっている', frEmpty.length === 0, JSON.stringify(frEmpty.map(f => `${f.kind}@${f.te}s:${f.pts}`)));
  check('裂け目（破線）は 3500 km 以内', fr.every(f => f.bridgeMax <= 3500), JSON.stringify(fr.map(f => Math.round(f.bridgeMax))));
  console.log('  → 波面: ' + fr.map(f => `${f.kind}@${f.te}s(${f.runs}本/${f.pts}点)`).join(' '));

  // --- 文言 ---
  const seisTxt = await page.locator('.view.show').first().innerText();
  check('「地震発生からの時間」の表現になっている', /地震発生からの時間/.test(seisTxt) && !/地震の時刻/.test(seisTxt));
  check('再生速度が「画面の1秒＝実際の○秒」で説明されている', /再生速度/.test(seisTxt) && /画面の1秒＝実際の60秒/.test(seisTxt));

  // --- 表示チェックが6つ独立している ---
  const togLabels = await page.locator('.view.show .controls:not(.detail) label').allTextContents();
  const want = ['P波の射線', 'P波の波面', 'S波の射線', 'S波の波面', 'P波の影', 'S波の影'];
  check('表示チェックが6つ（P/S × 射線・波面・影）', want.every(w => togLabels.some(l => l.replace(/\s/g, '').includes(w))),
    JSON.stringify(togLabels.map(s => s.trim())));
  // 6つを1つずつ外して、他に影響しないこと（独立に効く）
  const boxes = page.locator('.view.show .controls:not(.detail) input[type=checkbox]');
  check('チェックボックスがちょうど6つ', await boxes.count() === 6, `${await boxes.count()} 個`);
  for (let i = 0; i < 6; i++) {
    await boxes.nth(i).uncheck();
    const st = await page.evaluate(() => [...document.querySelectorAll('.view.show .controls:not(.detail) input[type=checkbox]')].map(c => c.checked));
    const ok = st.filter(v => !v).length === 1 && st[i] === false;
    check(`表示チェック ${i + 1}（${want[i]}）だけが外れる`, ok, JSON.stringify(st));
    await boxes.nth(i).check();
  }

  const obs = await page.locator('.view.show .controls .readout').nth(1).textContent();
  check('観測点の読み出しに Δ と P・S 到達が出る', /Δ =/.test(obs) && /P到達/.test(obs), obs);
  const ps = await page.locator('.view.show .controls .readout').nth(2).textContent();
  check('初期微動継続時間（S−P）が表示される', /s$/.test(ps.trim()), ps);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, 'long-seismic-1280.png'), fullPage: true });

  // --- 時間バー: tMax / timeLabel / loop ---
  const tv = () => page.locator('.view.show .tval').textContent();
  const qt = async () => parseFloat((await tv()).replace(/[^0-9.]/g, ''));   // 地震発生からの時間 [s]
  check('時間バーの表示が「地震発生からの時間 ○○ s」', /地震発生からの時間\s*[\d.]+\s*s/.test(await tv()), await tv());
  const tEnd = await page.evaluate(() => window.__nami_debug.seis.tEnd);
  const bar = await page.evaluate(() => {
    const r = document.querySelector('.view.show .timebar input[type=range]');
    return { max: parseFloat(r.max) };
  });
  check('時間バーの右端 = tMax = tEnd / 再生速度', Math.abs(bar.max - tEnd / 60) < 0.05, `max=${bar.max} 期待=${(tEnd / 60).toFixed(3)}`);
  console.log(`  → リピート周期 = 地震時間 ${tEnd} s（いちばん遅い波の到達＋120 s）`);

  // コマ送り・スロー・リセット・時間スクラブ
  await page.click('.view.show .timebar button:nth-child(1)');          // 停止
  await page.waitForTimeout(200);
  const tStop = await qt();
  await page.click('.view.show .timebar button:nth-child(3)');          // ▶ コマ送り
  await page.waitForTimeout(200);
  check('タブ7 コマ送り ▶ が period/12 進む', Math.abs((await qt()) - (tStop + tEnd / 12)) < 1.5, `${tStop} → ${await qt()}（1コマ=${(tEnd / 12).toFixed(1)} s）`);
  await page.click('.view.show .timebar button:nth-child(2)');          // ◀（時間は戻せる）
  await page.waitForTimeout(200);
  check('タブ7 コマ送り ◀ で元に戻る（時間は戻せる）', Math.abs((await qt()) - tStop) < 1.5, `${tStop} vs ${await qt()}`);
  check('◀ ボタンは無効化されていない', !(await page.locator('.view.show .timebar button:nth-child(2)').isDisabled()));
  await page.selectOption('.view.show .timebar select', '0.25');
  await page.click('.view.show .timebar button:nth-child(1)');          // 再開（×1/4）
  await page.waitForTimeout(900);
  const slowDt = (await qt()) - tStop;
  check('タブ7 スロー ×1/4 が効く（0.9秒で地震時間 3〜30 s ぶん）', slowDt > 3 && slowDt < 30, 'Δ=' + slowDt.toFixed(1) + ' s');
  await page.click('.view.show .timebar button:nth-child(1)');          // いったん停止
  await page.click('.view.show .timebar button:nth-child(5)');          // リセット
  await page.waitForTimeout(200);
  check('タブ7 リセットで t=0', (await qt()) === 0, await tv());
  await page.selectOption('.view.show .timebar select', '1');
  // 時間スクラブ（停止して過去の時刻へ）
  await page.click('.view.show .timebar button:nth-child(1)');
  const scrub = async v => { await page.evaluate(x => { const r = document.querySelector('.view.show .timebar input[type=range]'); r.value = x; r.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.waitForTimeout(250); };
  await scrub(10);
  check('タブ7 時間スクラブで任意時刻へ', Math.abs((await qt()) - 600) < 5, await tv());
  await scrub(5);
  check('タブ7 過去へ戻れる', Math.abs((await qt()) - 300) < 5, await tv());

  // リピート: 右端の少し手前へ飛ばして再生 → t=0 側へ戻る
  await scrub(tEnd / 60 - 0.35);
  await page.click('.view.show .timebar button:nth-child(1)');          // 再開
  await page.waitForTimeout(1200);
  const looped = await qt();
  check('右端まで行くと t=0 にもどってリピートする', looped < tEnd * 0.5, `地震発生からの時間 ${looped} s（右端 ${tEnd} s）`);

  // fps 相当（描画が止まっていないこと）
  const ta = await tv();
  await page.waitForTimeout(700);
  check('タブ7でアニメーションが進む', ta !== (await tv()), `${ta} → ${await tv()}`);

  // 再生速度（×15〜×600・既定 ×60。速度を変えても「地震発生からの時間」と右端は保たれる）
  await page.click('.view.show .timebar button:nth-child(1)');
  await page.waitForTimeout(200);
  const qB = await qt();
  const setSpeed = async i => { await page.evaluate(x => { const rs = [...document.querySelectorAll('.view.show .controls:not(.detail) input[type=range]')]; rs[1].value = x; rs[1].dispatchEvent(new Event('input', { bubbles: true })); }, i); await page.waitForTimeout(300); };
  await setSpeed(5);   // ×600
  const qA = await qt(), bar2 = await page.evaluate(() => parseFloat(document.querySelector('.view.show .timebar input[type=range]').max));
  check('再生速度を変えても地震発生からの時間は保たれる', Math.abs(qA - qB) < 2, `${qB} → ${qA} s`);
  check('再生速度を変えても地震時間の右端は同じ（画面の秒数だけ変わる）', Math.abs(bar2 - tEnd / 600) < 0.05, `右端 ${bar2.toFixed(3)} 画面秒 = 地震 ${(bar2 * 600).toFixed(0)} s`);
  const spTxt = await page.locator('.view.show .controls:not(.detail)').first().innerText();
  check('再生速度の最大が ×600（意味つき表示）', /×600（画面の1秒＝実際の600秒）/.test(spTxt), spTxt.slice(0, 60));
  await setSpeed(0);
  check('再生速度の最小が ×15', /×15（画面の1秒＝実際の15秒）/.test(await page.locator('.view.show .controls:not(.detail)').first().innerText()));
  await setSpeed(2);   // ×60 に戻す

  // --- 地震計の小窓をドラッグで動かせる ---
  const cvEl = page.locator('.view.show canvas').first();
  const bb = await cvEl.boundingBox();
  const shot0 = await cvEl.screenshot();
  await page.mouse.move(bb.x + bb.width - 90, bb.y + 40);   // 小窓（既定は右上）の中
  await page.mouse.down();
  await page.mouse.move(bb.x + 140, bb.y + bb.height - 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const shot1 = await cvEl.screenshot();
  check('地震計の小窓をドラッグすると絵が変わる（＝動いた）', Buffer.compare(shot0, shot1) !== 0);
  const movedPx = await page.evaluate(() => {   // 左下に移った小窓の枠を画素で探す
    const c = document.querySelector('.view.show canvas'), g = c.getContext('2d');
    const d = g.getImageData(0, Math.round(c.height * 0.72), c.width, 1).data;
    let n = 0; for (let x = 0; x < c.width; x++) { const i = x * 4; if (d[i] < 14 && d[i + 1] < 22 && d[i + 2] < 18 && d[i + 3] > 200) n++; }
    return n;
  });
  check('小窓が左下へ移動している（暗い枠の画素が下段にある）', movedPx > 30, `${movedPx} px`);
  // 震源・観測点のドラッグは生きている（小窓のドラッグに食われていない）
  const dBefore = (await page.locator('.view.show .controls .readout').nth(1).textContent()).match(/[\d.]+/)[0];
  const grab = await page.evaluate(() => {   // 観測点は Δ=75°（右上寄りの地表）
    const cvs = document.querySelector('.view.show canvas'), r = cvs.getBoundingClientRect();
    // 描画中心と半径から Δ=75° の地表点をもとめる（setViewIso で等方なので比だけで足りる）
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = Math.min(r.width, r.height) / 2 / 1.215;
    const th = 75 * Math.PI / 180;
    return { x: cx + R * Math.sin(th), y: cy - R * Math.cos(th), cx, cy, R };
  });
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.cx + grab.R * Math.sin(2.1), grab.cy - grab.R * Math.cos(2.1), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const dAfter = (await page.locator('.view.show .controls .readout').nth(1).textContent()).match(/[\d.]+/)[0];
  check('観測点のドラッグが生きている（Δ が変わる）', Math.abs(parseFloat(dAfter) - parseFloat(dBefore)) > 5, `${dBefore}° → ${dAfter}°`);
  await page.screenshot({ path: path.join(outDir, 'long-seismic-boxmoved-1280.png'), fullPage: true });

  await page.close();

  /* ---------- 400 幅（スマホ縦持ち） ---------- */
  const sp = await newPage(400, 900);
  await sp.goto(url('#seismic'));
  await sp.waitForFunction(() => window.__nami_debug && window.__nami_debug.seis && window.__nami_debug.seis.frontReady, null, { timeout: 30000 });
  await sp.waitForTimeout(500);
  const ov = await sp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('幅400で横スクロールが出ない', ov.sw <= ov.cw + 1, JSON.stringify(ov));
  const spBox = await sp.evaluate(() => {   // スマホ幅では操作子が図の下に回る
    const v = document.querySelector('.view.show'), s = v.querySelector('.stage'), c = v.querySelector('.controls:not(.detail)');
    return { stage: s.getBoundingClientRect().bottom, ctl: c.getBoundingClientRect().top, cw: s.querySelector('canvas').getBoundingClientRect().width };
  });
  check('幅400では操作子が図の下に回る', spBox.ctl >= spBox.stage - 2, JSON.stringify(spBox));
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
