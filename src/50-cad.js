/* ============================================================
   2D-Fläche (gemeinsam für Skizze, Textur, Karte) und CAD-Skizze
   ============================================================ */
const P2 = F.pane = { editor: null, w: 10, h: 10, dpr: 1 };
P2.init = function (host, canvas) {
  P2.host = host; P2.canvas = canvas; P2.ctx = canvas.getContext('2d');
  const fit = () => {
    if (host.hidden) return;
    P2.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect(); P2.w = Math.max(10, r.width); P2.h = Math.max(10, r.height);
    canvas.width = Math.round(P2.w * P2.dpr); canvas.height = Math.round(P2.h * P2.dpr);
    P2.redraw();
  };
  new ResizeObserver(fit).observe(canvas); P2.fit = fit;
  const loc = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, e }; };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => { if (!P2.editor || !P2.editor.down) return; canvas.setPointerCapture(e.pointerId); P2.editor.down(loc(e)); });
  canvas.addEventListener('pointermove', e => { if (P2.editor && P2.editor.move) P2.editor.move(loc(e)); });
  canvas.addEventListener('pointerup', e => { if (P2.editor && P2.editor.up) P2.editor.up(loc(e)); });
  canvas.addEventListener('pointercancel', e => { if (P2.editor && P2.editor.up) P2.editor.up(loc(e)); });
  canvas.addEventListener('dblclick', e => { if (P2.editor && P2.editor.dbl) P2.editor.dbl(loc(e)); });
  canvas.addEventListener('wheel', e => { if (P2.editor && P2.editor.wheel) { e.preventDefault(); P2.editor.wheel(loc(e), e.deltaY); } }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
};
P2.use = function (ed, title) {
  if (P2.editor && P2.editor !== ed && P2.editor.leave) P2.editor.leave();
  P2.editor = ed; P2.host.hidden = !ed;
  const t = $('#pane-title'); if (t) t.textContent = title || '';
  document.body.classList.toggle('has-pane', !!ed);
  if (ed) { ed.enter && ed.enter(); setTimeout(() => { P2.fit(); V.resize(); if (P2.editor === ed && ed.shown) ed.shown(); }, 30); } else setTimeout(V.resize, 30);
};
P2.redraw = function () {
  if (!P2.editor || P2.host.hidden) return; const c = P2.ctx;
  c.setTransform(P2.dpr, 0, 0, P2.dpr, 0, 0); c.clearRect(0, 0, P2.w, P2.h);
  P2.editor.draw(c, P2.w, P2.h);
};

/* ===================== Skizze ===================== */
const SK = F.sketch = {
  loops: [{ pts: [], closed: false, hole: false }], cur: 0, sel: null, snap: 0.1, view: { s: 90, ox: 0, oy: 0 },
  drag: null, pan: null, bg: null, plane: 'xy'
};
const sx = x => P2.w / 2 + SK.view.ox + x * SK.view.s, sy = y => P2.h / 2 + SK.view.oy - y * SK.view.s;
const fromS = (px, py) => [(px - P2.w / 2 - SK.view.ox) / SK.view.s, -(py - P2.h / 2 - SK.view.oy) / SK.view.s];
const snapV = v => SK.snap > 0 ? Math.round(v / SK.snap) * SK.snap : v;
SK.enter = function () { SK.hint(); };
SK.leave = function () { };
SK.hint = () => F.say('Skizze: Klick setzt Punkte, Doppelklick schließt die Kontur, Rechtsklick/Ziehen mit Leertaste verschiebt, Mausrad zoomt');
SK.cur_ = () => SK.loops[SK.cur];
SK.draw = function (c, w, h) {
  const css = cssVar, s = SK.view.s;
  c.fillStyle = css('--pane-bg'); c.fillRect(0, 0, w, h);
  if (SK.bg) { c.globalAlpha = 0.55; const iw = SK.bg.wm * s, ih = iw * SK.bg.img.height / SK.bg.img.width; c.drawImage(SK.bg.img, sx(-SK.bg.wm / 2), sy(ih / s / 2), iw, ih); c.globalAlpha = 1; }
  // Raster
  const step = SK.snap > 0 && SK.snap * s >= 8 ? SK.snap : (s >= 8 ? 1 : 10);
  const x0 = fromS(0, 0)[0], x1 = fromS(w, 0)[0], y1 = fromS(0, 0)[1], y0 = fromS(0, h)[1];
  c.lineWidth = 1;
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const major = Math.abs(Math.round(x) - x) < 1e-6; c.strokeStyle = major ? css('--pane-grid-a') : css('--pane-grid-b'); c.beginPath(); c.moveTo(Math.round(sx(x)) + 0.5, 0); c.lineTo(Math.round(sx(x)) + 0.5, h); c.stroke(); }
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const major = Math.abs(Math.round(y) - y) < 1e-6; c.strokeStyle = major ? css('--pane-grid-a') : css('--pane-grid-b'); c.beginPath(); c.moveTo(0, Math.round(sy(y)) + 0.5); c.lineTo(w, Math.round(sy(y)) + 0.5); c.stroke(); }
  c.strokeStyle = '#e5484d'; c.beginPath(); c.moveTo(0, sy(0)); c.lineTo(w, sy(0)); c.stroke();
  c.strokeStyle = '#46c37b'; c.beginPath(); c.moveTo(sx(0), 0); c.lineTo(sx(0), h); c.stroke();
  c.fillStyle = css('--pane-text'); c.font = '11px ' + css('--font-mono'); c.fillText('1 m = ' + Math.round(s) + ' px   Raster ' + (SK.snap || 'frei') + ' m', 10, h - 10);
  // Konturen
  SK.loops.forEach((lp, li) => {
    if (!lp.pts.length) return;
    c.beginPath(); lp.pts.forEach((p, i) => i ? c.lineTo(sx(p[0]), sy(p[1])) : c.moveTo(sx(p[0]), sy(p[1])));
    if (lp.closed) { c.closePath(); c.fillStyle = lp.hole ? css('--pane-hole') : css('--pane-fill'); c.fill(); }
    c.lineWidth = li === SK.cur ? 2 : 1.4; c.strokeStyle = lp.hole ? css('--danger') : css('--sel'); c.stroke();
    lp.pts.forEach((p, i) => { const on = SK.sel && SK.sel[0] === li && SK.sel[1] === i; c.fillStyle = on ? '#fff' : (lp.hole ? css('--danger') : css('--sel')); c.fillRect(sx(p[0]) - 4, sy(p[1]) - 4, 8, 8); if (on) { c.strokeStyle = css('--sel'); c.strokeRect(sx(p[0]) - 5, sy(p[1]) - 5, 10, 10); } });
  });
  if (SK.sel) { const p = SK.loops[SK.sel[0]].pts[SK.sel[1]]; if (p) { c.fillStyle = css('--pane-text'); c.fillText('x ' + fix(p[0], 3) + '  y ' + fix(p[1], 3), 10, 18); } }
};
SK.hit = function (px, py) {
  let best = null, bd = 100;
  SK.loops.forEach((lp, li) => lp.pts.forEach((p, i) => { const d = (sx(p[0]) - px) ** 2 + (sy(p[1]) - py) ** 2; if (d < bd) { bd = d; best = [li, i]; } }));
  return best;
};
SK.down = function (l) {
  const e = l.e;
  if (e.button === 1 || e.button === 2 || e.shiftKey && e.button === 0 && false) { SK.pan = { x: l.x, y: l.y, ox: SK.view.ox, oy: SK.view.oy }; return; }
  const hit = SK.hit(l.x, l.y);
  if (hit) { SK.sel = hit; SK.cur = hit[0]; SK.drag = true; P2.redraw(); SK.ui(); return; }
  let lp = SK.loops[SK.cur];
  if (lp.closed) { SK.loops.push({ pts: [], closed: false, hole: false }); SK.cur = SK.loops.length - 1; lp = SK.loops[SK.cur]; }
  const [x, y] = fromS(l.x, l.y); lp.pts.push([snapV(x), snapV(y)]); SK.sel = [SK.cur, lp.pts.length - 1]; SK.drag = true; P2.redraw(); SK.ui();
};
SK.move = function (l) {
  if (SK.pan) { SK.view.ox = SK.pan.ox + l.x - SK.pan.x; SK.view.oy = SK.pan.oy + l.y - SK.pan.y; P2.redraw(); return; }
  if (SK.drag && SK.sel) { const [x, y] = fromS(l.x, l.y), p = SK.loops[SK.sel[0]].pts[SK.sel[1]]; if (p) { p[0] = snapV(x); p[1] = snapV(y); P2.redraw(); } }
};
SK.up = function () { SK.drag = false; SK.pan = null; SK.ui(); };
SK.dbl = function () { SK.close(); };
SK.wheel = function (l, dy) {
  const k = dy < 0 ? 1.15 : 1 / 1.15, [wx, wy] = fromS(l.x, l.y); SK.view.s = clamp(SK.view.s * k, 6, 1600);
  SK.view.ox = l.x - P2.w / 2 - wx * SK.view.s; SK.view.oy = l.y - P2.h / 2 + wy * SK.view.s; P2.redraw();
};
SK.ui = function () { F.ui && F.ui.refreshSketch && F.ui.refreshSketch(); };
SK.close = function () { const lp = SK.loops[SK.cur]; if (lp.pts.length >= 3) { lp.closed = true; SK.sel = null; P2.redraw(); SK.ui(); } else F.say('Mindestens 3 Punkte nötig', 'err'); };
SK.newLoop = function (hole) { const lp = SK.loops[SK.cur]; if (!lp.pts.length) { lp.hole = !!hole; } else { SK.loops.push({ pts: [], closed: false, hole: !!hole }); SK.cur = SK.loops.length - 1; } SK.sel = null; P2.redraw(); SK.ui(); };
SK.undoPoint = function () { const lp = SK.loops[SK.cur]; if (lp.closed) lp.closed = false; else lp.pts.pop(); if (!lp.pts.length && SK.loops.length > 1) { SK.loops.splice(SK.cur, 1); SK.cur = SK.loops.length - 1; } SK.sel = null; P2.redraw(); SK.ui(); };
SK.removeSelected = function () { if (!SK.sel) return SK.undoPoint(); const lp = SK.loops[SK.sel[0]]; lp.pts.splice(SK.sel[1], 1); if (lp.pts.length < 3) lp.closed = false; SK.sel = null; P2.redraw(); SK.ui(); };
SK.clear = function () { SK.loops = [{ pts: [], closed: false, hole: false }]; SK.cur = 0; SK.sel = null; P2.redraw(); SK.ui(); };
SK.set = function (loops) { SK.loops = loops; SK.cur = loops.length - 1; SK.sel = null; P2.redraw(); SK.ui(); };
SK.templates = {
  rect: () => [{ pts: [[-1, -0.6], [1, -0.6], [1, 0.6], [-1, 0.6]], closed: true, hole: false }],
  circle: () => [{ pts: Array.from({ length: 32 }, (_, i) => [Math.cos(i / 32 * 6.2832) * 0.8, Math.sin(i / 32 * 6.2832) * 0.8]), closed: true, hole: false }],
  ring: () => [{ pts: Array.from({ length: 32 }, (_, i) => [Math.cos(i / 32 * 6.2832) * 0.9, Math.sin(i / 32 * 6.2832) * 0.9]), closed: true, hole: false }, { pts: Array.from({ length: 24 }, (_, i) => [Math.cos(i / 24 * 6.2832) * 0.5, Math.sin(i / 24 * 6.2832) * 0.5]), closed: true, hole: true }],
  lprofil: () => [{ pts: [[-1, -1], [1, -1], [1, -0.6], [-0.6, -0.6], [-0.6, 1], [-1, 1]], closed: true, hole: false }],
  star: () => [{ pts: Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.4 : 1, a = i / 10 * 6.2832 + 1.5708; return [Math.cos(a) * r, Math.sin(a) * r]; }), closed: true, hole: false }],
  vase: () => [{ pts: [[0.001, 0], [0.5, 0], [0.62, 0.3], [0.45, 0.7], [0.3, 1.0], [0.34, 1.35], [0.5, 1.5]], closed: false, hole: false }],
  haus: () => [{ pts: [[-1.2, -0.8], [1.2, -0.8], [1.2, 0.3], [0.2, 0.3], [0.2, 0.9], [-1.2, 0.9]], closed: true, hole: false }]
};
SK.template = function (name) { const t = SK.templates[name]; if (t) SK.set(t()); };
SK.setBackground = function (file, widthM) {
  const fr = new FileReader();
  fr.onload = () => { const img = new Image(); img.onload = () => { SK.bg = { img, wm: widthM || 10 }; SK.view.s = Math.max(6, (P2.w * 0.8) / (widthM || 10)); P2.redraw(); F.say('Referenzbild geladen – Breite ' + (widthM || 10) + ' m (Wert im Feld ändern, wenn nötig)'); }; img.src = fr.result; };
  fr.readAsDataURL(file);
};
const inPoly = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
SK.shapes = function () {
  const outer = SK.loops.filter(l => l.closed && !l.hole && l.pts.length >= 3), holes = SK.loops.filter(l => l.closed && l.hole && l.pts.length >= 3);
  if (!outer.length) throw new Error('Keine geschlossene Kontur – Doppelklick schließt die Kontur');
  const shapes = outer.map(l => new THREE.Shape(l.pts.map(p => new THREE.Vector2(p[0], p[1]))));
  holes.forEach(hl => { const i = outer.findIndex(o => inPoly(hl.pts[0], o.pts)); (shapes[i >= 0 ? i : 0]).holes.push(new THREE.Path(hl.pts.map(p => new THREE.Vector2(p[0], p[1])))); });
  return shapes;
};
SK.extrude = function (depth, bevel, plane) {
  const shapes = SK.shapes(), b = Math.max(0, bevel || 0);
  let g = new THREE.ExtrudeGeometry(shapes, { depth: Math.max(0.001, depth), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 12 });
  if (plane === 'xz') g.rotateX(-Math.PI / 2); else g.translate(0, 0, -depth / 2);
  return V.addMesh(g, { name: 'Extrusion', kind: 'mesh', dropToGrid: plane === 'xz' ? true : false, position: plane === 'xz' ? [0, 0, 0] : [0, 0, 0] });
};
SK.lathe = function (segments, angle) {
  let lp = SK.loops.find(l => l.pts.length >= 2); if (!lp) throw new Error('Mindestens zwei Punkte als Profil zeichnen (x = Radius, y = Höhe)');
  let pts = lp.pts.map(p => new THREE.Vector2(Math.max(0.0005, Math.abs(p[0])), p[1]));
  if (pts[0].y > pts[pts.length - 1].y) pts = pts.reverse();
  const g = new THREE.LatheGeometry(pts, Math.max(3, Math.round(segments)), 0, (angle || 360) * DEG);
  const m = V.makeMaterial(); m.side = THREE.DoubleSide;
  return V.addMesh(g, { name: 'Drehkörper', kind: 'mesh', material: m, position: [0, 0, 0] });
};
