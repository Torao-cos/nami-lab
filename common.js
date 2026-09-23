/* なみラボ 共通ライブラリ (Nami)  — 外部依存なし
 *
 * 使い方（各ページ）:
 *   Nami.init({ title:'A 波の基本', tabs:[ {id, label, period:()=>T, scrub:true, build(ctx){ ...; return {draw(t,dt,running){...}} } }, ... ] });
 *
 * build(ctx) に渡る ctx:
 *   ctx.stage      … 描画面グリッド (div.stage)。ctx.layout('1'|'2'|'3'|'2x2') で列数指定
 *   ctx.canvas(opts) … Nami.Canvas を stage に追加（opts.title, opts.onClick 省略時=停止/再開）
 *   ctx.controls   … 操作パネル (div.controls)。Nami.ui.* で部品を追加
 *   ctx.detail     … 「詳しく」パネル（既定 hidden）
 *   ctx.sim        … 時間制御 (t, running, speed, toggle(), step(±1), reset(), setT(v))
 *   ctx.redraw()   … 即時再描画を要求（スライダー変更時など。ループが毎フレーム描くので通常不要）
 * 返り値: { draw(t, dt, running) } … 毎フレーム呼ばれる。dt=このフレームで進んだ物理時間(停止中は0)
 *
 * Canvas（ワールド座標で描く）:
 *   cv.setView({x0,x1,y0,y1}) / cv.setViewIso(cx,cy,halfW) / cv.axes({xLabel,yLabel,xStep,yStep})
 *   cv.plot(fn,{color,width,dash,alpha,x0,x1}) / cv.line / cv.arrow / cv.dot / cv.circle / cv.text / cv.hbracket / cv.vbracket
 *   cv.addHandle({get:()=>({x,y}), set:(x,y)=>{}, r:18, color}) … ドラッグ可能な点。cv.drawHandles()
 *   cv.px(x), cv.py(y), cv.wx(px), cv.wy(py) … 座標変換
 *
 * ui: Nami.ui.slider/toggle/select/button/readout/note/formula/sep(parent, opts)
 * 波形: Nami.Wave.periodic[name](phase) / Nami.Wave.pulse[name](u∈[-0.5,0.5]) / Nami.Wave.labels
 */
'use strict';
window.Nami = (() => {
  const C = {
    bg: '#020503', panel: '#101a15', line: '#264436', text: '#e8fff2', muted: '#9ac5ad',
    wave: '#54ff8a', wave1: '#69b7ff', wave2: '#ff6b6b', vel: '#ffa64d', dens: '#c792ff',
    node: '#ffd166', anti: '#4dd0e1', guide: '#9ac5ad', grid: '#17271e', axis: '#5d8f74',
    ghost: 'rgba(232,255,242,0.35)', yellow: '#ffd166'
  };
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const frac = p => p - Math.floor(p);
  const fmt = (v, d = 2) => (Math.abs(v) < 5e-10 ? 0 : v).toFixed(d);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function niceStep(range, target = 6) {
    const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }
  /* ---- 物理の書体規則: 変数（代数の英字・ギリシャ文字）＝斜体、単位・関数名・略語＝立体 ---- */
  const UPRIGHT = new Set(['sin', 'cos', 'tan', 'log', 'exp', 'max', 'min', 'Hz', 'km', 'ms', 'cm', 'mm', 'kg', 'fps', 'rad', 'deg', 'OK', 'ON', 'OFF', 'NG', 'ID', 'PC', 'UI', 'URL', 'MIT', 'FDTD', 'PREM', 'PKP', 'PKIKP', 'RK', 'CDN', 'Lab', 'Nami', 'Oto']);
  const SUB = '₀-₉′″'; // 下付き数字・プライム
  const TOKEN = new RegExp(`(\\d(?:[.,]\\d+)?\\s?)?([A-Za-z\\u0391-\\u03A9\\u03B1-\\u03C9\\u0394][A-Za-z\\u0391-\\u03A9\\u03B1-\\u03C9${SUB}]*(?:/[A-Za-z\\u0391-\\u03A9\\u03B1-\\u03C9][A-Za-z\\u0391-\\u03A9\\u03B1-\\u03C9${SUB}]*)*)`, 'g');
  const UNITS = new Set(['m', 's', 'Hz', 'km', 'cm', 'mm', 'ms', 'kg', 'g', 'N', 'J', 'W', 'Pa', 'K', 'min', 'h', 'rad', 'deg', 'fps', 'px', 'dB']);
  const isUnit = tok => tok.split('/').every(p => UNITS.has(p));
  function isVariable(tok) { // tok に '/' は含まない
    if (UPRIGHT.has(tok)) return false;
    const letters = tok.replace(new RegExp(`[${SUB}]`, 'g'), '');
    if (letters.length === 1) return true;                          // x, λ, T
    if (/[₀-₉]/.test(tok)) return true;                   // S₁P, v₂
    if (letters.length >= 3 && /^[A-Z]+$/.test(letters)) return false; // FDTD, PKP（略語）
    if (letters.length <= 3) return true;                           // mλ, fλ, vt, Δt, πA, AB（積・線分）
    return false;                                                   // 単語
  }
  function mathRuns(str) { // → [{t, i}] i=斜体
    const runs = []; let last = 0; str = String(str);
    const push = (t, i) => { if (!t) return; const p = runs[runs.length - 1]; if (p && p.i === i) p.t += t; else runs.push({ t, i }); };
    for (const m of str.matchAll(TOKEN)) {
      push(str.slice(last, m.index), false);
      // 直前の "[" 以降で "]" 未閉の範囲は単位表記
      const openIdx = str.lastIndexOf('[', m.index), closeIdx = str.lastIndexOf(']', m.index); const inBracket = openIdx > closeIdx;
      const num = m[1] || '', tok = m[2];
      if (inBracket || (num && isUnit(tok))) push(num + tok, false);
      else { push(num, false); tok.split(/(\/)/).forEach(p => { if (p.startsWith('π')) { push('π', false); p = p.slice(1); } if (p) push(p, p !== '/' && isVariable(p)); }); }
      last = m.index + m[0].length;
    }
    push(str.slice(last), false);
    return runs;
  }
  function mathHTML(str) { // HTMLタグはそのまま、テキスト部分だけ変換
    return String(str).split(/(<[^>]+>)/).map(seg => (seg.startsWith('<') ? seg : mathRuns(seg).map(r => (r.i ? '<i>' + r.t + '</i>' : r.t)).join(''))).join('');
  }
  function hexA(hex, a) { // '#rrggbb' → rgba
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* ---------------- Canvas ---------------- */
  class Canvas {
    constructor(parent, opt = {}) {
      this.opt = opt;
      this.box = el('div', 'panel' + (opt.className ? ' ' + opt.className : ''));
      if (opt.title) {
        this.titleEl = el('div', 'panelTitle'); this.titleEl.innerHTML = mathHTML(opt.title);
        if (opt.maximizable !== false) { this.titleEl.title = 'クリックで拡大／戻す'; this.titleEl.addEventListener('click', () => this.toggleMax()); }
        this.box.appendChild(this.titleEl);
      }
      this.el = el('canvas');
      this.box.appendChild(this.el);
      this.overlay = el('div', 'overlay'); this.box.appendChild(this.overlay);
      this.overlayTL = el('div', 'overlayTL'); this.box.appendChild(this.overlayTL);
      parent.appendChild(this.box);
      this.ctx = this.el.getContext('2d');
      this.handles = []; this.onClick = opt.onClick || null; this.onDrag = null; this.onDrawRequest = null;
      this.pad = { l: 46, r: 18, t: 16, b: 32 };
      this.view = { x0: 0, x1: 10, y0: -2, y1: 2 };
      this.w = 0; this.h = 0; this.dpr = 1;
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.el);
      this.resize();
      this._bindPointer();
    }
    setTitle(s) { if (this.titleEl) this.titleEl.innerHTML = mathHTML(s); }
    toggleMax() {
      const grid = this.box.parentElement; const on = this.box.classList.toggle('max');
      grid.classList.toggle('hasMax', on);
      [...grid.children].forEach(c => { if (c !== this.box) c.classList.toggle('hiddenByMax', on); });
    }
    resize() {
      const r = this.el.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w === this.w && h === this.h && dpr === this.dpr) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.el.width = Math.round(w * dpr); this.el.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    /* --- 座標 --- */
    setPad(p) { Object.assign(this.pad, p); return this; }
    setView(v) { Object.assign(this.view, v); return this; }
    setViewIso(cx, cy, halfW) { // 等方（縦横同縮尺）。横半幅 halfW を基準に縦を決める
      const iw = Math.max(1, this.iw), ih = Math.max(1, this.ih);
      const halfH = halfW * ih / iw;
      this.view = { x0: cx - halfW, x1: cx + halfW, y0: cy - halfH, y1: cy + halfH };
      return this;
    }
    get iw() { return this.w - this.pad.l - this.pad.r; }
    get ih() { return this.h - this.pad.t - this.pad.b; }
    get sx() { return this.iw / (this.view.x1 - this.view.x0); } // px per world unit
    get sy() { return this.ih / (this.view.y1 - this.view.y0); }
    px(x) { return this.pad.l + (x - this.view.x0) * this.sx; }
    py(y) { return this.pad.t + (this.view.y1 - y) * this.sy; }
    wx(p) { return this.view.x0 + (p - this.pad.l) / this.sx; }
    wy(p) { return this.view.y1 - (p - this.pad.t) / this.sy; }
    /* --- 基本描画 --- */
    clear(bg = C.bg) { const g = this.ctx; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.el.width, this.el.height); g.restore(); g.fillStyle = bg; g.fillRect(0, 0, this.w, this.h); }
    clip(fn) { const g = this.ctx; g.save(); g.beginPath(); g.rect(this.pad.l, this.pad.t, this.iw, this.ih); g.clip(); fn(); g.restore(); }
    _stroke(o) { const g = this.ctx; g.strokeStyle = o.color || C.text; g.lineWidth = o.width || 2; g.setLineDash(o.dash || []); g.globalAlpha = o.alpha == null ? 1 : o.alpha; g.lineCap = 'round'; g.lineJoin = 'round'; }
    _done() { const g = this.ctx; g.setLineDash([]); g.globalAlpha = 1; }
    axes(o = {}) {
      const g = this.ctx, v = this.view;
      const xs = o.xStep || niceStep(v.x1 - v.x0), ys = o.yStep || niceStep(v.y1 - v.y0);
      const xAxisY = (v.y0 <= 0 && v.y1 >= 0) ? 0 : v.y0, yAxisX = (v.x0 <= 0 && v.x1 >= 0) ? 0 : v.x0;
      g.save();
      // grid
      if (o.grid !== false) {
        g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath();
        for (let x = Math.ceil(v.x0 / xs) * xs; x <= v.x1 + 1e-9; x += xs) { const p = Math.round(this.px(x)) + .5; g.moveTo(p, this.pad.t); g.lineTo(p, this.pad.t + this.ih); }
        for (let y = Math.ceil(v.y0 / ys) * ys; y <= v.y1 + 1e-9; y += ys) { const p = Math.round(this.py(y)) + .5; g.moveTo(this.pad.l, p); g.lineTo(this.pad.l + this.iw, p); }
        g.stroke();
      }
      // axes
      g.strokeStyle = C.axis; g.lineWidth = 1.5; g.beginPath();
      const ay = this.py(xAxisY), ax = this.px(yAxisX);
      if (o.xAxis !== false) { g.moveTo(this.pad.l, ay); g.lineTo(this.pad.l + this.iw, ay); }
      if (o.yAxis !== false) { g.moveTo(ax, this.pad.t); g.lineTo(ax, this.pad.t + this.ih); }
      g.stroke();
      // ticks
      g.fillStyle = C.muted; g.font = '12px system-ui,sans-serif';
      if (o.xTicks !== false) {
        g.textAlign = 'center'; g.textBaseline = 'top';
        const dx = Math.max(0, -Math.floor(Math.log10(xs)));
        for (let x = Math.ceil(v.x0 / xs) * xs; x <= v.x1 + 1e-9; x += xs) {
          if (Math.abs(x) < 1e-9 && o.xAxis !== false && yAxisX === 0 && xAxisY === 0) continue;
          const lbl = o.xTick ? o.xTick(x) : fmt(x, dx);
          g.fillText(lbl, this.px(x), Math.min(this.h - 14, ay + 4));
        }
      }
      if (o.yTicks !== false) {
        g.textAlign = 'right'; g.textBaseline = 'middle';
        const dy = Math.max(0, -Math.floor(Math.log10(ys)));
        for (let y = Math.ceil(v.y0 / ys) * ys; y <= v.y1 + 1e-9; y += ys) {
          if (Math.abs(y) < 1e-9 && xAxisY === 0) continue;
          g.fillText(o.yTick ? o.yTick(y) : fmt(y, dy), Math.max(this.pad.l - 4, 14 + 4 * String(fmt(y, dy)).length), this.py(y));
        }
      }
      g.restore();
      // labels（変数は斜体・単位は立体）
      if (o.xLabel) this.textPx(o.xLabel, this.pad.l + this.iw - 2, ay - 3, { align: 'right', baseline: 'bottom', bold: true, bg: false });
      if (o.yLabel) this.textPx(o.yLabel, ax + 5, this.pad.t + 2, { align: 'left', baseline: 'top', bold: true, bg: false });
    }
    plot(fn, o = {}) {
      const g = this.ctx; const x0 = o.x0 == null ? this.view.x0 : o.x0, x1 = o.x1 == null ? this.view.x1 : o.x1;
      const n = o.n || Math.max(8, Math.round(Math.abs(this.px(x1) - this.px(x0)) / (o.stepPx || 2)));
      this._stroke(o); g.beginPath(); let pen = false;
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n; const y = fn(x);
        if (y == null || !isFinite(y)) { pen = false; continue; }
        const X = this.px(x), Y = this.py(y);
        if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y);
      }
      g.stroke(); this._done();
    }
    plotPts(pts, o = {}) { // [{x,y}] or [[x,y]]
      const g = this.ctx; this._stroke(o); g.beginPath();
      pts.forEach((p, i) => { const x = p.x != null ? p.x : p[0], y = p.y != null ? p.y : p[1]; if (i === 0) g.moveTo(this.px(x), this.py(y)); else g.lineTo(this.px(x), this.py(y)); });
      if (o.close) g.closePath();
      if (o.fill) { g.fillStyle = o.fill; g.fill(); }
      if (o.color !== 'none') g.stroke(); this._done();
    }
    line(x1, y1, x2, y2, o = {}) { const g = this.ctx; this._stroke(o); g.beginPath(); g.moveTo(this.px(x1), this.py(y1)); g.lineTo(this.px(x2), this.py(y2)); g.stroke(); this._done(); }
    linePx(X1, Y1, X2, Y2, o = {}) { const g = this.ctx; this._stroke(o); g.beginPath(); g.moveTo(X1, Y1); g.lineTo(X2, Y2); g.stroke(); this._done(); }
    arrow(x1, y1, x2, y2, o = {}) { this.arrowPx(this.px(x1), this.py(y1), this.px(x2), this.py(y2), o); }
    arrowPx(X1, Y1, X2, Y2, o = {}) {
      const g = this.ctx; const dx = X2 - X1, dy = Y2 - Y1, L = Math.hypot(dx, dy); if (L < 1.5) { if (o.zeroDot) this.dotPx(X1, Y1, 3, { color: o.color }); return; }
      const h = Math.min(o.head || 9, L * 0.6), ux = dx / L, uy = dy / L;
      this._stroke(o); g.beginPath(); g.moveTo(X1, Y1); g.lineTo(X2 - ux * h * 0.6, Y2 - uy * h * 0.6); g.stroke();
      g.fillStyle = o.color || C.text; g.beginPath(); g.moveTo(X2, Y2); g.lineTo(X2 - ux * h - uy * h * 0.5, Y2 - uy * h + ux * h * 0.5); g.lineTo(X2 - ux * h + uy * h * 0.5, Y2 - uy * h - ux * h * 0.5); g.closePath(); g.fill(); this._done();
    }
    dot(x, y, r = 4, o = {}) { this.dotPx(this.px(x), this.py(y), r, o); }
    dotPx(X, Y, r = 4, o = {}) { const g = this.ctx; g.globalAlpha = o.alpha == null ? 1 : o.alpha; g.fillStyle = o.color || C.text; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill(); if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = o.width || 1.5; g.stroke(); } g.globalAlpha = 1; }
    circle(x, y, rWorld, o = {}) { // 半径はワールド（x縮尺）。等方ビューで使う
      const g = this.ctx; this._stroke(o); g.beginPath(); g.ellipse(this.px(x), this.py(y), rWorld * this.sx, rWorld * this.sy, 0, o.a0 || 0, o.a1 == null ? TAU : o.a1); if (o.fill) { g.fillStyle = o.fill; g.fill(); } if (o.color !== 'none') g.stroke(); this._done();
    }
    text(str, x, y, o = {}) { this.textPx(str, this.px(x), this.py(y), o); }
    textPx(str, X, Y, o = {}) { // 変数は斜体・単位は立体（o.rich===false で無効）
      const g = this.ctx; g.save(); const size = o.size || 13, fontOf = it => `${it ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${size}px system-ui,sans-serif`;
      const runs = o.rich === false ? [{ t: String(str), i: false }] : mathRuns(str);
      runs.forEach(r => { g.font = fontOf(r.i); r.w = g.measureText(r.t).width; });
      const W = runs.reduce((s, r) => s + r.w, 0);
      const align = o.align || 'center'; g.textBaseline = o.baseline || 'middle'; X += o.dx || 0; Y += o.dy || 0;
      let x0 = align === 'center' ? X - W / 2 : align === 'right' ? X - W : X;
      if (o.bg !== false) { const w = W + 6, h = size + 4; let by = Y - h / 2; if (g.textBaseline === 'top') by = Y - 2; if (g.textBaseline === 'bottom') by = Y - h + 2; g.fillStyle = o.bg || 'rgba(2,5,3,0.75)'; g.fillRect(x0 - 3, by, w, h); }
      g.fillStyle = o.color || C.text; g.textAlign = 'left';
      runs.forEach(r => { g.font = fontOf(r.i); g.fillText(r.t, x0, Y); x0 += r.w; });
      g.restore();
    }
    hbracket(x1, x2, y, label, o = {}) { // 水平ブラケット（y位置・ワールド）
      const g = this.ctx, X1 = this.px(x1), X2 = this.px(x2), Y = this.py(y), t = (o.tick || 6) * (o.below ? -1 : 1);
      this._stroke({ color: o.color || C.yellow, width: o.width || 1.5 }); g.beginPath(); g.moveTo(X1, Y + t); g.lineTo(X1, Y); g.lineTo(X2, Y); g.lineTo(X2, Y + t); g.stroke(); this._done();
      if (label) this.textPx(label, (X1 + X2) / 2, Y + (o.below ? 12 : -12), { color: o.color || C.yellow, bold: true, size: o.size || 14 });
    }
    vbracket(x, y1, y2, label, o = {}) {
      const g = this.ctx, X = this.px(x), Y1 = this.py(y1), Y2 = this.py(y2), t = (o.tick || 6) * (o.left ? 1 : -1);
      this._stroke({ color: o.color || C.yellow, width: o.width || 1.5 }); g.beginPath(); g.moveTo(X + t, Y1); g.lineTo(X, Y1); g.lineTo(X, Y2); g.lineTo(X + t, Y2); g.stroke(); this._done();
      if (label) this.textPx(label, X + (o.left ? -14 : 14), (Y1 + Y2) / 2, { color: o.color || C.yellow, bold: true, size: o.size || 14, align: o.left ? 'right' : 'left' });
    }
    /* --- ドラッグ点 --- */
    addHandle(h) { h.r = h.r || 20; this.handles.push(h); return h; }
    drawHandles() { for (const h of this.handles) { if (h.hidden) continue; const q = h.get(); const X = this.px(q.x), Y = this.py(q.y); this.dotPx(X, Y, h.size || 7, { color: h.color || C.yellow, stroke: '#000', width: 1.5 }); if (h.label) this.textPx(h.label, X, Y, { dy: -16, color: h.color || C.yellow, bold: true }); } }
    _pt(e) { const r = this.el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    _hit(p) { for (const h of this.handles) { if (h.hidden) continue; const q = h.get(); if (Math.hypot(this.px(q.x) - p.x, this.py(q.y) - p.y) <= h.r) return h; } return null; }
    _bindPointer() {
      const e = this.el;
      e.addEventListener('pointerdown', ev => {
        const p = this._pt(ev); const h = this._hit(p);
        this._down = { p, moved: false, h, id: ev.pointerId };
        try { e.setPointerCapture(ev.pointerId); } catch (_) { }
        if (h && h.onStart) h.onStart(p);
        if (!h && this.onDragStart) this.onDragStart(this.wx(p.x), this.wy(p.y), p);
        ev.preventDefault();
      });
      e.addEventListener('pointermove', ev => {
        const p = this._pt(ev);
        if (!this._down) { e.style.cursor = this._hit(p) ? 'grab' : (this.onDragStart ? 'crosshair' : 'pointer'); return; }
        if (Math.hypot(p.x - this._down.p.x, p.y - this._down.p.y) > 5) this._down.moved = true;
        if (this._down.h) { this._down.h.set(this.wx(p.x), this.wy(p.y), p); e.style.cursor = 'grabbing'; }
        else if (this.onDrag && this._down.moved) this.onDrag(this.wx(p.x), this.wy(p.y), p);
      });
      const up = ev => {
        if (!this._down) return; const d = this._down; this._down = null; e.style.cursor = 'pointer';
        if (d.h && d.h.onEnd) d.h.onEnd();
        if (!d.h && this.onDragEnd) this.onDragEnd(d.moved);
        if (!d.moved && !d.h && this.onClick) this.onClick(this.wx(d.p.x), this.wy(d.p.y), d.p);
      };
      e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
    }
  }

  /* ---------------- UI 部品 ---------------- */
  const ui = {
    group(parent, label) { const d = el('div', 'ctl'); if (label) { const s = el('span', 'ctlLabel'); s.innerHTML = mathHTML(label); d.appendChild(s); } parent.appendChild(d); return d; },
    slider(parent, o) {
      const d = ui.group(parent, o.label); const r = el('input'); r.type = 'range'; r.min = o.min; r.max = o.max; r.step = o.step == null ? 'any' : o.step; r.value = o.value;
      const v = el('span', 'val'); d.appendChild(r); d.appendChild(v);
      const f = o.fmt || (x => fmt(x, o.digits == null ? 2 : o.digits) + (o.unit ? ' ' + o.unit : ''));
      const upd = () => { v.textContent = f(parseFloat(r.value)); };
      r.addEventListener('input', () => { upd(); if (o.onInput) o.onInput(parseFloat(r.value)); });
      upd();
      return { el: r, box: d, get: () => parseFloat(r.value), set: (x, silent) => { r.value = x; upd(); if (!silent && o.onInput) o.onInput(parseFloat(r.value)); } };
    },
    toggle(parent, o) {
      const d = ui.group(parent); const lab = el('label'); const c = el('input'); c.type = 'checkbox'; c.checked = !!o.checked;
      lab.appendChild(c); const lt = el('span'); lt.innerHTML = ' ' + mathHTML(o.label); lab.appendChild(lt); d.appendChild(lab);
      c.addEventListener('change', () => { if (o.onChange) o.onChange(c.checked); });
      return { el: c, box: d, get: () => c.checked, set: (b, silent) => { c.checked = !!b; if (!silent && o.onChange) o.onChange(c.checked); } };
    },
    select(parent, o) {
      const d = ui.group(parent, o.label); const s = el('select');
      o.options.forEach(([val, txt]) => { const op = el('option', null, txt); op.value = val; s.appendChild(op); });
      s.value = o.value; d.appendChild(s); s.addEventListener('change', () => { if (o.onChange) o.onChange(s.value); });
      return { el: s, box: d, get: () => s.value, set: (v, silent) => { s.value = v; if (!silent && o.onChange) o.onChange(s.value); } };
    },
    button(parent, o) { const b = el('button', o.className || '', o.label); parent.appendChild(b); b.addEventListener('click', o.onClick); return b; },
    buttons(parent, label, list) { const d = ui.group(parent, label); return list.map(o => ui.button(d, o)); },
    readout(parent, o) { const d = ui.group(parent, o.label); const s = el('span', 'readout'); s.innerHTML = mathHTML(o.value || ''); d.appendChild(s); return { box: d, set: t => { s.innerHTML = mathHTML(t); } }; },
    note(parent, text) { const n = el('div', 'note'); n.innerHTML = mathHTML(text); parent.appendChild(n); return n; },
    formula(parent, html) { const f = el('div', 'formula'); f.innerHTML = mathHTML(html || ''); parent.appendChild(f); return { el: f, set: h => { f.innerHTML = mathHTML(h); } }; },
    sep(parent) { parent.appendChild(el('div', 'sep')); },
    legend(parent, items) { // [[color,label],...]
      const d = ui.group(parent); items.forEach(([c, l]) => { const s = el('span'); const sw = el('span', 'swatch'); sw.style.background = c; s.appendChild(sw); const lt = el('span'); lt.innerHTML = mathHTML(l); s.appendChild(lt); s.style.color = C.muted; s.style.fontSize = '.9rem'; d.appendChild(s); }); return d;
    }
  };

  /* ---------------- 波形 ---------------- */
  const Wave = {
    // 周期波形: 位相 p（周期1）→ [-1,1]
    periodic: {
      sin: p => Math.sin(TAU * p),
      tri: p => { p = frac(p); return p < .25 ? 4 * p : p < .75 ? 2 - 4 * p : 4 * p - 4; },
      square: p => (frac(p) < .5 ? 1 : -1),
      saw: p => 2 * frac(p) - 1
    },
    // パルス: u∈[-0.5,0.5] で非零、外は0。最大1
    pulse: {
      tri: u => Math.max(0, 1 - Math.abs(2 * u)),
      rect: u => (Math.abs(u) < .5 ? 1 : 0),
      saw: u => (u < -.5 || u > .5 ? 0 : u + .5),
      gauss: u => (Math.abs(u) < .5 ? Math.exp(-u * u / (2 * .15 * .15)) : 0),
      sin1: u => (Math.abs(u) < .5 ? Math.sin(TAU * (u + .5)) : 0),
      half: u => (Math.abs(u) < .5 ? Math.cos(Math.PI * u) : 0)
    },
    labels: { sin: '正弦波', tri: '三角波', square: '矩形波', saw: 'のこぎり波', rect: '矩形パルス', gauss: 'ガウス型', sin1: 'sin 1周期', half: '半波（山1つ）' },
    // 進行波の関数を作る: 右進行 y = A f(t/T - x/λ)
    traveling(o) { const A = o.A, T = o.T, L = o.lambda, d = o.dir || 1, f = Wave.periodic[o.shape || 'sin']; return (x, t) => A * f(t / T - d * x / L); },
    // パルス進行波: 幅 w、t=0 で中心 x0、速さ v、向き d
    travelingPulse(o) { const A = o.A, w = o.w, x0 = o.x0, v = o.v, d = o.dir || 1, f = o.fn || Wave.pulse[o.shape || 'tri']; return (x, t) => A * f((x - x0 - d * v * t) / w); }
  };

  /* ---------------- 時間制御 ---------------- */
  class Sim {
    constructor(tab, bar, app) {
      this.tab = tab; this.app = app; this.t = 0; this.running = true; this.speed = 1; this.tMaxView = 10;
      this.canScrub = tab.scrub !== false;
      const b = this.bar = bar;
      this.playBtn = ui.button(b, { label: '⏸ 停止', onClick: () => this.toggle() });
      this.stepBack = ui.button(b, { label: '◀', onClick: () => this.step(-1) }); this.stepBack.title = '1コマ戻す（←）';
      this.stepFwd = ui.button(b, { label: '▶', onClick: () => this.step(1) }); this.stepFwd.title = '1コマ進める（→）';
      const sp = el('select'); [['1', '×1'], ['0.5', '×1/2'], ['0.25', '×1/4']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sp.appendChild(o); });
      sp.addEventListener('change', () => { this.speed = parseFloat(sp.value); }); b.appendChild(sp); this.speedSel = sp;
      ui.button(b, { label: 'リセット', onClick: () => this.reset() });
      this.range = el('input'); this.range.type = 'range'; this.range.min = 0; this.range.max = this.tMaxView; this.range.step = 'any'; this.range.value = 0; this.range.title = '時間（停止中にドラッグで過去へ戻れる）';
      if (this.canScrub) { b.appendChild(this.range); this.range.addEventListener('input', () => { this.pause(); this.t = parseFloat(this.range.value); }); }
      this.tval = el('span', 'tval', 't = 0.00 s'); b.appendChild(this.tval);
      this.detailBtn = ui.button(b, { label: '詳しく', className: 'detailBtn', onClick: () => this.toggleDetail() });
    }
    period() { const T = this.tab.period ? this.tab.period() : 2; return (T > 0 && isFinite(T)) ? T : 2; }
    setRunning(r) { this.running = r; this.playBtn.textContent = r ? '⏸ 停止' : '▶ 再開'; this.playBtn.classList.toggle('active', !r); this.app.showStatus(this, r ? '' : '⏸ 停止中（クリックで再開）'); }
    toggle() { this.setRunning(!this.running); }
    pause() { if (this.running) this.setRunning(false); }
    play() { if (!this.running) this.setRunning(true); }
    step(dir) { this.pause(); this.t = Math.max(0, this.t + dir * this.period() / 12); if (this.tab.api && this.tab.api.onStep) this.tab.api.onStep(dir); }
    reset() { this.t = 0; if (this.tab.api && this.tab.api.onReset) this.tab.api.onReset(); }
    setT(v) { this.t = Math.max(0, v); }
    toggleDetail() { const on = this.tab.ctx.detail.hidden; this.tab.ctx.detail.hidden = !on; this.detailBtn.classList.toggle('active', on); }
    tick(dtReal) { let dt = 0; if (this.running) { dt = Math.min(dtReal, 0.05) * this.speed; this.t += dt; } this.tMaxView = Math.max(this.tMaxView, this.t); this.range.max = this.tMaxView; if (this.canScrub) this.range.value = this.t; this.tval.innerHTML = '<i>t</i> = ' + fmt(this.t, 2) + ' s'; return dt; }
  }

  /* ---------------- アプリ ---------------- */
  const app = { tabs: [], active: null, canvases: [] };
  app.showStatus = (sim, text) => { const tab = sim.tab; tab.ctx.statusEls.forEach(s => { s.textContent = text; s.hidden = !text; }); };

  function init(o) {
    document.title = o.title + ' - なみラボ';
    const hub = o.hub || '../scicos-lab/';
    const header = el('header', 'top');
    const crumb = el('div', 'crumb');
    const a1 = el('a', null, 'SciCos 理科ラボ'); a1.href = hub; crumb.appendChild(a1); crumb.appendChild(document.createTextNode('›'));
    const a2 = el('a', null, 'なみラボ'); a2.href = './index.html'; crumb.appendChild(a2); crumb.appendChild(document.createTextNode('›'));
    crumb.appendChild(el('span', 'title', o.title)); header.appendChild(crumb);
    header.appendChild(el('span', 'right', 'クリック=停止/再開　◀▶=コマ送り　Space/←→キー可'));
    document.body.appendChild(header);
    const nav = el('nav', 'tabs'); document.body.appendChild(nav);
    const main = el('main'); document.body.appendChild(main);
    const footer = el('footer'); footer.innerHTML = (o.footer ? o.footer + '<br>' : '') + '画面をクリック／タップで停止・再開。停止中も点やカット線はドラッグできます。時間バーで過去に戻れます（回折を除く）。 © SciCos / MIT License'; document.body.appendChild(footer);

    o.tabs.forEach(tab => {
      const btn = el('button'); btn.innerHTML = mathHTML(tab.label); btn.addEventListener('click', () => activate(tab.id, true)); nav.appendChild(btn); tab.btn = btn;
      const view = el('section', 'view'); main.appendChild(view); tab.view = view; tab.built = false;
      app.tabs.push(tab);
    });
    function build(tab) {
      const view = tab.view;
      const stage = el('div', 'stage'); view.appendChild(stage);
      const bar = el('div', 'timebar'); view.appendChild(bar);
      const controls = el('div', 'controls'); view.appendChild(controls);
      const detail = el('div', 'controls detail'); detail.hidden = true; view.appendChild(detail);
      const ctx = { stage, controls, detail, statusEls: [], canvases: [] };
      tab.ctx = ctx;
      const sim = new Sim(tab, bar, app); ctx.sim = sim;
      ctx.layout = k => { stage.classList.remove('cols2', 'cols3'); if (k === '2' || k === '2x2') stage.classList.add('cols2'); if (k === '3') stage.classList.add('cols3'); };
      ctx.canvas = (opts = {}) => { const cv = new Canvas(stage, Object.assign({ onClick: () => sim.toggle() }, opts)); const st = el('div', 'status'); st.hidden = true; cv.box.appendChild(st); ctx.statusEls.push(st); ctx.canvases.push(cv); return cv; };
      ctx.redraw = () => { };
      tab.api = tab.build(ctx) || {};
      tab.built = true;
    }
    function activate(id, pushHash) {
      const tab = app.tabs.find(t => t.id === id) || app.tabs[0];
      if (!tab.built) build(tab);
      app.tabs.forEach(t => { t.view.classList.toggle('show', t === tab); t.btn.classList.toggle('active', t === tab); });
      app.active = tab;
      if (pushHash && location.hash !== '#' + tab.id) history.replaceState(null, '', '#' + tab.id);
      tab.ctx.canvases.forEach(c => c.resize());
      if (tab.api.onShow) tab.api.onShow();
    }
    window.addEventListener('hashchange', () => activate(location.hash.slice(1), false));
    activate(location.hash.slice(1), false);

    // キー操作
    window.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName) || ''; if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(tag)) return;
      const sim = app.active && app.active.ctx.sim; if (!sim) return;
      if (e.code === 'Space') { sim.toggle(); e.preventDefault(); }
      else if (e.code === 'ArrowRight') { sim.step(1); e.preventDefault(); }
      else if (e.code === 'ArrowLeft') { sim.step(-1); e.preventDefault(); }
    });

    // ループ
    let last = performance.now();
    function loop(now) {
      const dtReal = Math.max(0, (now - last) / 1000); last = now;
      const tab = app.active;
      if (tab && tab.built) { const dt = tab.ctx.sim.tick(dtReal); try { tab.api.draw(tab.ctx.sim.t, dt, tab.ctx.sim.running); } catch (err) { console.error(err); } }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return app;
  }

  /* 記録計（y-t）描画ヘルパ: t 軸は右向きに固定。ペンが左から右へ進み、右端に達したら次のページ（[k·span, (k+1)·span]）へ */
  function recorderWindow(t, span) { const x0 = Math.floor(t / span) * span; return { x0, x1: x0 + span }; }
  function recorder(cv, o) {
    const t = o.t, span = o.span; const { x0, x1 } = recorderWindow(t, span);
    cv.setView({ x0, x1, y0: o.y0 == null ? -o.A * 1.3 : o.y0, y1: o.y1 == null ? o.A * 1.3 : o.y1 });
    cv.axes({ xLabel: o.xLabel || 't [s]', yLabel: o.yLabel || 'y [m]', xStep: o.xStep, yStep: o.yStep, xAxis: true });
    cv.clip(() => { cv.plot(tt => (tt < 0 ? null : o.y(tt)), { color: o.color || C.wave, width: o.width || 2.5, x0: Math.max(0, x0), x1: t, dash: o.dash }); });
    if (o.pen !== false && t >= 0) cv.dot(t, o.y(t), 5, { color: o.color || C.wave, stroke: '#000' });
  }

  return { C, TAU, clamp, frac, fmt, el, niceStep, hexA, mathHTML, mathRuns, Canvas, ui, Wave, Sim, init, recorder, recorderWindow, app };
})();
