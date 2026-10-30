/* ============================================================
   Textur-Studio: Ebenen, Pinsel, Filter, Generatoren, 3D-Malen
   ============================================================ */
const PT = F.paint = {
  size: 1024, docs: {}, slot: 'map', color: '#d4572a', color2: '#ffffff', tool: 'brush', fillShape: true,
  brush: { size: 36, hardness: 0.6, opacity: 1 }, view: { s: 0.5, ox: 0, oy: 0 }, paint3d: false, showUV: true, stroke: null, hist: [], needs: false, tol: 24
};
PT.SLOTS = { map: 'Farbe', bumpMap: 'Höhe (Bump)', roughnessMap: 'Rauheit', metalnessMap: 'Metall', normalMap: 'Normalmap' };
const SLOT_BASE = { map: '#ffffff', bumpMap: '#808080', roughnessMap: '#ffffff', metalnessMap: '#000000', normalMap: '#8080ff' };
PT.BLEND = [['source-over', 'Normal'], ['multiply', 'Multiplizieren'], ['screen', 'Negativ mult.'], ['overlay', 'Überlagern'], ['soft-light', 'Weiches Licht'], ['darken', 'Abdunkeln'], ['lighten', 'Aufhellen'], ['difference', 'Differenz'], ['color', 'Farbe']];
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
const hex2rgb = hx => { const m = /^#?([0-9a-f]{6})$/i.exec(hx || ''); const n = m ? parseInt(m[1], 16) : 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
PT.doc = function (slot) { slot = slot || PT.slot; return PT.docs[slot] || (PT.docs[slot] = PT.newDoc(slot, PT.size)); };
PT.cur = () => PT.doc();
PT.layer = () => { const d = PT.cur(); return d.layers[d.active]; };

PT.newDoc = function (slot, size) {
  const out = mkCanvas(size), tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  if (slot === 'map') tex.encoding = THREE.sRGBEncoding;
  const d = { slot, size, layers: [], active: 0, out, tex, buf: null };
  PT.addLayer(d, 'Hintergrund', SLOT_BASE[slot] || '#ffffff');
  PT.docs[slot] = d; /* vor compose() eintragen: compose zeichnet das Fenster neu und fragt dabei wieder nach diesem Dokument */
  PT.compose(d); return d;
};
PT.addLayer = function (d, name, fill) {
  const c = mkCanvas(d.size), x = c.getContext('2d', { willReadFrequently: true });
  if (fill) { x.fillStyle = fill; x.fillRect(0, 0, d.size, d.size); }
  d.layers.splice(d.active + (d.layers.length ? 1 : 0), 0, { name: name || ('Ebene ' + (d.layers.length + 1)), canvas: c, ctx: x, visible: true, opacity: 1, blend: 'source-over' });
  d.active = d.layers.length === 1 ? 0 : d.active + 1; return d.layers[d.active];
};
PT.compose = function (d) {
  d = d || PT.cur(); const x = d.out.getContext('2d'); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, d.size, d.size);
  d.layers.forEach((l, i) => {
    if (!l.visible) return; x.globalAlpha = l.opacity; x.globalCompositeOperation = l.blend;
    if (PT.stroke && PT.stroke.doc === d && PT.stroke.layer === l && PT.stroke.mode === 'brush') {
      if (!d.tmp) d.tmp = mkCanvas(d.size); const t = d.tmp.getContext('2d'); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, d.size, d.size);
      t.drawImage(l.canvas, 0, 0); t.globalAlpha = PT.brush.opacity; t.drawImage(PT.stroke.buf, 0, 0); x.drawImage(d.tmp, 0, 0);
    } else x.drawImage(l.canvas, 0, 0);
  });
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; d.tex.needsUpdate = true; V.requestRender(); P2.redraw();
};
PT.dirty = () => { PT.needs = true; };
PT.tick = () => { if (PT.needs) { PT.needs = false; PT.compose(); } };

/* ---- Rückgängig (nur Pixeländerungen der aktiven Ebene) ---- */
PT.snap = function () {
  const d = PT.cur(), l = PT.layer(); PT.hist.push({ d, l, data: l.ctx.getImageData(0, 0, d.size, d.size) }); if (PT.hist.length > 14) PT.hist.shift();
};
PT.undo = function () {
  const e = PT.hist.pop(); if (!e) return false; e.l.ctx.putImageData(e.data, 0, 0); PT.compose(e.d); F.say('Textur: Rückgängig'); return true;
};

/* ---- Pinsel ---- */
const tipCache = {};
function tip(size, hard, color) {
  const key = size + '|' + hard + '|' + color; if (tipCache[key]) return tipCache[key];
  const s = Math.max(2, Math.ceil(size)), c = mkCanvas(s), x = c.getContext('2d'), r = s / 2, [R, Gc, B] = hex2rgb(color);
  if (hard >= 0.98) { x.fillStyle = color; x.beginPath(); x.arc(r, r, r, 0, 6.2832); x.fill(); }
  else { const g = x.createRadialGradient(r, r, r * hard, r, r, r); g.addColorStop(0, 'rgba(' + R + ',' + Gc + ',' + B + ',1)'); g.addColorStop(1, 'rgba(' + R + ',' + Gc + ',' + B + ',0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }
  const keys = Object.keys(tipCache); if (keys.length > 40) delete tipCache[keys[0]];
  return (tipCache[key] = c);
}
PT.stamp = function (ctx, x, y, press) {
  const b = PT.brush, r = b.size / 2, t = tip(b.size, b.hardness, PT.tool === 'eraser' ? '#000000' : PT.color);
  ctx.globalAlpha = clamp(press === undefined ? 1 : press, 0.05, 1) * (PT.tool === 'eraser' ? b.opacity : 1);
  ctx.drawImage(t, x - r, y - r, b.size, b.size); ctx.globalAlpha = 1;
};
PT.segment = function (ctx, a, b, press) {
  const st = PT.stroke, step = Math.max(1, PT.brush.size * 0.12), dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
  let d = st.carry; while (d <= dist) { const k = dist ? d / dist : 0; PT.stamp(ctx, a.x + dx * k, a.y + dy * k, press); d += step; } st.carry = d - dist;
};
PT.begin = function (x, y, press) {
  const d = PT.cur(), l = PT.layer(); if (!l) return;
  PT.snap();
  const mode = PT.tool === 'eraser' ? 'eraser' : 'brush';
  PT.stroke = { doc: d, layer: l, mode, last: { x, y }, carry: 0, buf: null };
  if (mode === 'brush') { PT.stroke.buf = mkCanvas(d.size); PT.stroke.ctx = PT.stroke.buf.getContext('2d'); PT.stamp(PT.stroke.ctx, x, y, press); }
  else { l.ctx.globalCompositeOperation = 'destination-out'; PT.stamp(l.ctx, x, y, press); l.ctx.globalCompositeOperation = 'source-over'; }
  PT.dirty();
};
PT.move = function (x, y, press) {
  const st = PT.stroke; if (!st) return;
  if (st.mode === 'brush') PT.segment(st.ctx, st.last, { x, y }, press);
  else { st.layer.ctx.globalCompositeOperation = 'destination-out'; PT.segment(st.layer.ctx, st.last, { x, y }, press); st.layer.ctx.globalCompositeOperation = 'source-over'; }
  st.last = { x, y }; PT.dirty();
};
PT.end = function () {
  const st = PT.stroke; if (!st) return;
  if (st.mode === 'brush') { st.layer.ctx.globalAlpha = PT.brush.opacity; st.layer.ctx.drawImage(st.buf, 0, 0); st.layer.ctx.globalAlpha = 1; }
  PT.stroke = null; PT.compose(st.doc);
};

/* ---- Füllen / Formen / Verlauf ---- */
PT.floodFill = function (x, y) {
  const d = PT.cur(), l = PT.layer(), W = d.size; x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= W || y >= W) return;
  PT.snap(); const img = l.ctx.getImageData(0, 0, W, W), p = img.data, i0 = (y * W + x) * 4, t = [p[i0], p[i0 + 1], p[i0 + 2], p[i0 + 3]], f = hex2rgb(PT.color), tol = PT.tol * 4;
  if (t[0] === f[0] && t[1] === f[1] && t[2] === f[2] && t[3] === 255) return;
  const match = i => Math.abs(p[i] - t[0]) + Math.abs(p[i + 1] - t[1]) + Math.abs(p[i + 2] - t[2]) + Math.abs(p[i + 3] - t[3]) <= tol;
  const stack = [x, y], seen = new Uint8Array(W * W);
  while (stack.length) {
    let yy = stack.pop(), xx = stack.pop(); let xl = xx; while (xl >= 0 && !seen[yy * W + xl] && match((yy * W + xl) * 4)) xl--; xl++;
    let up = false, dn = false;
    for (let xi = xl; xi < W && !seen[yy * W + xi] && match((yy * W + xi) * 4); xi++) {
      const i = (yy * W + xi) * 4; seen[yy * W + xi] = 1; p[i] = f[0]; p[i + 1] = f[1]; p[i + 2] = f[2]; p[i + 3] = 255;
      if (yy > 0) { const m = !seen[(yy - 1) * W + xi] && match(((yy - 1) * W + xi) * 4); if (m && !up) { stack.push(xi, yy - 1); up = true; } else if (!m) up = false; }
      if (yy < W - 1) { const m = !seen[(yy + 1) * W + xi] && match(((yy + 1) * W + xi) * 4); if (m && !dn) { stack.push(xi, yy + 1); dn = true; } else if (!m) dn = false; }
    }
  }
  l.ctx.putImageData(img, 0, 0); PT.compose();
};
PT.shape = function (kind, a, b) {
  const l = PT.layer(); PT.snap(); const c = l.ctx; c.globalAlpha = PT.brush.opacity; c.fillStyle = PT.color; c.strokeStyle = PT.color; c.lineWidth = PT.brush.size / 4 + 1; c.lineCap = 'round';
  if (kind === 'line') { c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineWidth = Math.max(1, PT.brush.size / 3); c.stroke(); }
  else if (kind === 'rect') { PT.fillShape ? c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y) : c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
  else if (kind === 'ellipse') { c.beginPath(); c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, 6.2832); PT.fillShape ? c.fill() : c.stroke(); }
  else if (kind === 'gradient') { const g = c.createLinearGradient(a.x, a.y, b.x, b.y); g.addColorStop(0, PT.color); g.addColorStop(1, PT.color2); c.fillStyle = g; c.fillRect(0, 0, PT.cur().size, PT.cur().size); }
  c.globalAlpha = 1; PT.compose();
};
PT.pick = function (x, y) {
  const d = PT.cur(), p = d.out.getContext('2d').getImageData(clamp(Math.floor(x), 0, d.size - 1), clamp(Math.floor(y), 0, d.size - 1), 1, 1).data;
  PT.setColor('#' + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, '0')).join(''));
};
PT.setColor = c => { PT.color = c; F.ui && F.ui.refreshPaint && F.ui.refreshPaint(); };

/* ---- Ebenen ---- */
PT.layerOp = function (op, arg) {
  const d = PT.cur();
  if (op === 'add') PT.addLayer(d, 'Ebene ' + (d.layers.length + 1));
  else if (op === 'dup') { const s = PT.layer(), n = PT.addLayer(d, s.name + ' Kopie'); n.ctx.drawImage(s.canvas, 0, 0); n.opacity = s.opacity; n.blend = s.blend; }
  else if (op === 'del') { if (d.layers.length < 2) return F.say('Mindestens eine Ebene bleibt', 'err'); d.layers.splice(d.active, 1); d.active = Math.max(0, d.active - 1); }
  else if (op === 'up' && d.active < d.layers.length - 1) { const l = d.layers.splice(d.active, 1)[0]; d.layers.splice(++d.active, 0, l); }
  else if (op === 'down' && d.active > 0) { const l = d.layers.splice(d.active, 1)[0]; d.layers.splice(--d.active, 0, l); }
  else if (op === 'merge' && d.active > 0) { const t = d.layers[d.active], b = d.layers[d.active - 1]; PT.snap(); b.ctx.globalAlpha = t.opacity; b.ctx.globalCompositeOperation = t.blend; b.ctx.drawImage(t.canvas, 0, 0); b.ctx.globalAlpha = 1; b.ctx.globalCompositeOperation = 'source-over'; d.layers.splice(d.active, 1); d.active--; }
  else if (op === 'flatten') { PT.compose(d); const n = d.layers[0]; n.ctx.globalCompositeOperation = 'source-over'; n.ctx.clearRect(0, 0, d.size, d.size); n.ctx.drawImage(d.out, 0, 0); d.layers = [n]; d.active = 0; n.opacity = 1; n.blend = 'source-over'; n.visible = true; }
  PT.compose(d); F.ui && F.ui.refreshPaint && F.ui.refreshPaint();
};
PT.importImage = function (file) {
  const fr = new FileReader();
  fr.onload = () => { const img = new Image(); img.onload = () => { const d = PT.cur(), l = PT.addLayer(d, file.name.replace(/\.[^.]+$/, '').slice(0, 24)); l.ctx.drawImage(img, 0, 0, d.size, d.size); PT.compose(d); F.ui && F.ui.refreshPaint && F.ui.refreshPaint(); F.say('Bild als Ebene eingefügt (auf Dokumentgröße gestreckt)'); }; img.onerror = () => F.say('Bild konnte nicht gelesen werden', 'err'); img.src = fr.result; };
  fr.readAsDataURL(file);
};
PT.resetDoc = function (size) { const slot = PT.slot, old = PT.docs[slot]; PT.size = size; delete PT.docs[slot]; PT.hist.length = 0; const d = PT.doc(slot); if (old && old.assigned) { PT.assign(slot, true); } F.ui && F.ui.refreshPaint && F.ui.refreshPaint(); P2.redraw(); };
PT.dataURL = () => { PT.compose(); return PT.cur().out.toDataURL('image/png'); };

/* ---- Filter ---- */
const clampB = v => v < 0 ? 0 : v > 255 ? 255 : v;
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, s = 0, l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; } return [hh, s, l]; }
function hsl2rgb(hh, s, l) { if (s === 0) { const v = l * 255; return [v, v, v]; } const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255]; }
function boxBlur(src, W, H, r, ch) { // trennbar, Randwiederholung
  const out = new Uint8ClampedArray(src.length), tmp = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < H; y++) for (let c = 0; c < ch; c++) { let acc = 0; for (let k = -r; k <= r; k++) acc += src[(y * W + clamp(k, 0, W - 1)) * 4 + c]; for (let x = 0; x < W; x++) { tmp[(y * W + x) * 4 + c] = acc / n; acc += src[(y * W + Math.min(W - 1, x + r + 1)) * 4 + c] - src[(y * W + Math.max(0, x - r)) * 4 + c]; } }
  for (let x = 0; x < W; x++) for (let c = 0; c < ch; c++) { let acc = 0; for (let k = -r; k <= r; k++) acc += tmp[(clamp(k, 0, H - 1) * W + x) * 4 + c]; for (let y = 0; y < H; y++) { out[(y * W + x) * 4 + c] = acc / n; acc += tmp[(Math.min(H - 1, y + r + 1) * W + x) * 4 + c] - tmp[(Math.max(0, y - r) * W + x) * 4 + c]; } }
  if (ch < 4) for (let i = 3; i < out.length; i += 4) out[i] = src[i];
  return out;
}
PT.FILTERS = {
  invert: { label: 'Invertieren', fn(p) { for (let i = 0; i < p.length; i += 4) { p[i] = 255 - p[i]; p[i + 1] = 255 - p[i + 1]; p[i + 2] = 255 - p[i + 2]; } } },
  gray: { label: 'Graustufen', fn(p) { for (let i = 0; i < p.length; i += 4) { const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = p[i + 1] = p[i + 2] = v; } } },
  bc: { label: 'Helligkeit / Kontrast', a: ['Helligkeit', -100, 100, 0], b: ['Kontrast', -100, 100, 0], fn(p, W, H, a, b) { const f = (259 * (b + 255)) / (255 * (259 - b)); for (let i = 0; i < p.length; i += 4) for (let c = 0; c < 3; c++) p[i + c] = clampB(f * (p[i + c] - 128) + 128 + a * 2.55); } },
  hsl: { label: 'Farbton / Sättigung', a: ['Farbton °', -180, 180, 0], b: ['Sättigung %', -100, 100, 0], fn(p, W, H, a, b) { for (let i = 0; i < p.length; i += 4) { const x = rgb2hsl(p[i], p[i + 1], p[i + 2]); x[0] = (x[0] + a / 360 + 1) % 1; x[1] = clamp(x[1] * (1 + b / 100), 0, 1); const c = hsl2rgb(x[0], x[1], x[2]); p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; } } },
  blur: { label: 'Weichzeichnen', a: ['Radius px', 1, 40, 6], fn(p, W, H, r) { let o = p; for (let k = 0; k < 2; k++) o = boxBlur(o, W, H, Math.max(1, Math.round(r / 1.5)), 4); p.set(o); } },
  sharpen: { label: 'Schärfen', a: ['Stärke', 0, 300, 100], fn(p, W, H, s) { const b = boxBlur(p, W, H, 2, 3), k = s / 100; for (let i = 0; i < p.length; i += 4) for (let c = 0; c < 3; c++) p[i + c] = clampB(p[i + c] + (p[i + c] - b[i + c]) * k); } },
  noise: { label: 'Rauschen', a: ['Menge', 0, 100, 20], fn(p, W, H, a) { for (let i = 0; i < p.length; i += 4) { const n = (Math.random() - 0.5) * a * 2.55; p[i] = clampB(p[i] + n); p[i + 1] = clampB(p[i + 1] + n); p[i + 2] = clampB(p[i + 2] + n); } } },
  poster: { label: 'Tontrennung', a: ['Stufen', 2, 12, 4], fn(p, W, H, n) { const k = 255 / (n - 1); for (let i = 0; i < p.length; i += 4) for (let c = 0; c < 3; c++) p[i + c] = Math.round(p[i + c] / 255 * (n - 1)) * k; } },
  threshold: { label: 'Schwellenwert', a: ['Wert', 0, 255, 128], fn(p, W, H, t) { for (let i = 0; i < p.length; i += 4) { const v = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) >= t ? 255 : 0; p[i] = p[i + 1] = p[i + 2] = v; } } },
  normal: { label: 'Höhe → Normalmap', a: ['Stärke', 1, 20, 4], fn(p, W, H, s) {
    const hgt = new Float32Array(W * H); for (let i = 0; i < W * H; i++) hgt[i] = (0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]) / 255;
    const at = (x, y) => hgt[((y + H) % H) * W + ((x + W) % W)];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * s * 0.25, ny = dy * s * 0.25, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * W + x) * 4; p[i] = (nx * 0.5 + 0.5) * 255; p[i + 1] = (ny * 0.5 + 0.5) * 255; p[i + 2] = (nz * 0.5 + 0.5) * 255; p[i + 3] = 255;
    } } }
};
PT.applyFilter = function (name, a, b) {
  const f = PT.FILTERS[name], d = PT.cur(), l = PT.layer(); if (!f) return; PT.snap();
  const img = l.ctx.getImageData(0, 0, d.size, d.size); f.fn(img.data, d.size, d.size, a, b); l.ctx.putImageData(img, 0, 0); PT.compose(); F.say(f.label + ' angewendet');
};
PT.flip = function (kind) {
  const d = PT.cur(), l = PT.layer(); PT.snap(); const t = mkCanvas(d.size); t.getContext('2d').drawImage(l.canvas, 0, 0);
  l.ctx.save(); l.ctx.clearRect(0, 0, d.size, d.size);
  if (kind === 'h') { l.ctx.translate(d.size, 0); l.ctx.scale(-1, 1); } else if (kind === 'v') { l.ctx.translate(0, d.size); l.ctx.scale(1, -1); } else { l.ctx.translate(d.size / 2, d.size / 2); l.ctx.rotate(Math.PI / 2); l.ctx.translate(-d.size / 2, -d.size / 2); }
  l.ctx.drawImage(t, 0, 0); l.ctx.restore(); PT.compose();
};

/* ---- Generatoren (füllen die aktive Ebene) ---- */
function hash(x, y, s) { let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177; n = n ^ (n >>> 16); return (n >>> 0) / 4294967295; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), dd = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v; }
function fbm(x, y, s, oct) { let a = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { t += a * vnoise(x * f, y * f, s + i * 17); f *= 2; a *= 0.5; } return t; }
PT.GENS = {
  checker: { label: 'Schachbrett', a: ['Felder', 2, 64, 8], fn(W, x, y, a, c1, c2) { const k = W / a; return (Math.floor(x / k) + Math.floor(y / k)) % 2 ? c1 : c2; } },
  clouds: { label: 'Wolken / Rauschen', a: ['Skalierung', 1, 40, 6], fn(W, x, y, a, c1, c2) { const t = fbm(x / W * a, y / W * a, 3, 5); return mixc(c1, c2, t); } },
  marble: { label: 'Marmor', a: ['Skalierung', 1, 20, 4], fn(W, x, y, a, c1, c2) { const t = 0.5 + 0.5 * Math.sin((x / W * a + fbm(x / W * a * 1.5, y / W * a * 1.5, 7, 5) * 3) * Math.PI * 2); return mixc(c1, c2, t); } },
  wood: { label: 'Holzmaserung', a: ['Ringe', 2, 40, 12], fn(W, x, y, a, c1, c2) { const u = x / W - 0.5, v = y / W * 0.15 - 0.1, r = Math.hypot(u * 0.6, v) * a + fbm(x / W * 6, y / W * 30, 11, 4) * 0.8; return mixc(c1, c2, (r % 1)); } },
  bricks: { label: 'Ziegel', a: ['Reihen', 2, 40, 10], fn(W, x, y, a, c1, c2) { const rh = W / a, row = Math.floor(y / rh), bw = rh * 2.2, xo = x + (row % 2) * bw / 2, col = Math.floor(xo / bw), lx = xo - col * bw, ly = y - row * rh, m = Math.max(2, W / 300); if (lx < m || ly < m) return c2; const n = hash(col, row, 5); return mixc(c1, [c1[0] * 0.78, c1[1] * 0.78, c1[2] * 0.78], n); } },
  uv: { label: 'UV-Testraster', a: ['Felder', 2, 32, 8], fn(W, x, y, a, c1, c2) { const k = W / a, i = Math.floor(x / k), j = Math.floor(y / k), hue = ((i * 53 + j * 97) % 360) / 360, c = hsl2rgb(hue, 0.55, ((i + j) % 2) ? 0.42 : 0.58); return c; } },
  ramp: { label: 'Verlauf senkrecht', a: ['—', 0, 0, 0], fn(W, x, y, a, c1, c2) { return mixc(c1, c2, y / W); } }
};
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
PT.generate = function (name, a) {
  const g = PT.GENS[name], d = PT.cur(), l = PT.layer(), W = d.size; if (!g) return; PT.snap();
  const c1 = hex2rgb(PT.color), c2 = hex2rgb(PT.color2), img = l.ctx.createImageData(W, W), p = img.data;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const c = g.fn(W, x, y, a, c1, c2), i = (y * W + x) * 4; p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = 255; }
  l.ctx.putImageData(img, 0, 0);
  if (name === 'uv') { l.ctx.fillStyle = '#fff'; l.ctx.font = 'bold ' + Math.round(W / a / 3) + 'px sans-serif'; l.ctx.textAlign = 'center'; l.ctx.textBaseline = 'middle'; const k = W / a; for (let j = 0; j < a; j++) for (let i = 0; i < a; i++) l.ctx.fillText(String.fromCharCode(65 + (i % 26)) + (j + 1), i * k + k / 2, j * k + k / 2); }
  PT.compose(); F.say(g.label + ' erzeugt');
};

/* ---- Zuweisen an das Modell ---- */
PT.assign = function (slot, silent) {
  slot = slot || PT.slot; const o = S.active; if (!o || !o.isMesh) return F.say('Zuerst ein Objekt auswählen', 'err');
  if (!o.geometry.attributes.uv || F.geo.stats(o.geometry).verts === 0) return;
  const d = PT.doc(slot), m = o.material;
  if (o.userData.sculpt && !o.userData.uvDone) { /* weniger Warnungen: Hinweis unten in der UI */ }
  m[slot] = d.tex; if (slot === 'metalnessMap') m.metalness = 1; if (slot === 'roughnessMap') m.roughness = 1; if (slot === 'bumpMap') m.bumpScale = m.bumpScale || 1;
  if (slot === 'normalMap') m.normalScale = new THREE.Vector2(1, 1);
  m.needsUpdate = true; d.assigned = true; d.target = o; V.requestRender(); PT.compose(d);
  if (!silent) F.say(PT.SLOTS[slot] + ' → ' + o.name + ' zugewiesen. Malen auf dem Modell: „Direkt auf 3D-Modell malen“ aktivieren');
};
PT.unassign = function (slot) { const o = S.active; if (!o) return; o.material[slot || PT.slot] = null; o.material.needsUpdate = true; V.requestRender(); };
PT.ensureUV = function (kind) {
  const o = S.active; if (!o) return F.say('Zuerst ein Objekt auswählen', 'err');
  V.setGeometry(o, F.geo.uv(o.geometry, kind || 'box', 1), 'UV (' + (kind || 'box') + ')', 'mesh', null); o.userData.sculpt = false;
  F.say('UV-Koordinaten erzeugt (' + (kind || 'box') + ')'); P2.redraw();
};

/* ---- 2D-Editor in der Fläche ---- */
const toDoc = l => { const d = PT.cur(), v = PT.view; return { x: (l.x - P2.w / 2 - v.ox) / v.s + d.size / 2, y: (l.y - P2.h / 2 - v.oy) / v.s + d.size / 2 }; };
const PE = F.paintEditor = {
  drag: null, pan: null,
  enter() { PT.doc(); PE.fitView(); F.say('Textur-Studio: Pinsel, Ebenen, Filter. Rechte Maustaste verschiebt, Mausrad zoomt.'); },
  leave() { if (PT.stroke) PT.end(); },
  shown() { PE.fitView(); P2.redraw(); }, /* erst jetzt hat das Fenster seine echte Größe */
  fitView() { const d = PT.cur(); PT.view.s = Math.max(0.05, Math.min(P2.w, P2.h) * 0.92 / d.size); PT.view.ox = 0; PT.view.oy = 0; },
  draw(c, w, h) {
    const d = PT.cur(), v = PT.view, s = v.s, x0 = w / 2 + v.ox - d.size * s / 2, y0 = h / 2 + v.oy - d.size * s / 2;
    c.fillStyle = cssVar('--pane-bg'); c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = s < 1; c.drawImage(d.out, x0, y0, d.size * s, d.size * s);
    c.strokeStyle = cssVar('--pane-grid-a'); c.lineWidth = 1; c.strokeRect(x0 + 0.5, y0 + 0.5, d.size * s, d.size * s);
    const o = S.active;
    if (PT.showUV && o && o.geometry && o.geometry.attributes.uv && F.geo.stats(o.geometry).tris <= 60000) {
      const uv = o.geometry.attributes.uv, idx = o.geometry.index, n = idx ? idx.count : uv.count; c.strokeStyle = 'rgba(255,166,48,.55)'; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i + 2 < n; i += 3) { for (let k = 0; k < 3; k++) { const a = idx ? idx.getX(i + k) : i + k; const px = x0 + uv.getX(a) * d.size * s, py = y0 + (1 - uv.getY(a)) * d.size * s; k ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); }
      c.stroke();
    }
    if (PE.drag && PE.drag.kind) { const a = PE.drag.a, b = PE.drag.b; c.strokeStyle = cssVar('--sel'); c.lineWidth = 1.5; const ax = x0 + a.x * s, ay = y0 + a.y * s, bx = x0 + b.x * s, by = y0 + b.y * s; c.beginPath(); if (PE.drag.kind === 'rect') c.rect(ax, ay, bx - ax, by - ay); else if (PE.drag.kind === 'ellipse') c.ellipse((ax + bx) / 2, (ay + by) / 2, Math.abs(bx - ax) / 2, Math.abs(by - ay) / 2, 0, 0, 6.2832); else { c.moveTo(ax, ay); c.lineTo(bx, by); } c.stroke(); }
    c.fillStyle = cssVar('--pane-text'); c.font = '11px ' + cssVar('--font-mono'); c.fillText(PT.SLOTS[PT.slot] + '  ' + d.size + '×' + d.size + '  ' + Math.round(s * 100) + ' %', 10, h - 10);
  },
  down(l) {
    const e = l.e; if (e.button === 1 || e.button === 2) { PE.pan = { x: l.x, y: l.y, ox: PT.view.ox, oy: PT.view.oy }; return; }
    const p = toDoc(l), t = PT.tool, press = e.pointerType === 'pen' ? e.pressure : 1;
    if (t === 'brush' || t === 'eraser') { PT.begin(p.x, p.y, press); PE.drag = { brush: true, pen: e.pointerType === 'pen' }; }
    else if (t === 'fill') PT.floodFill(p.x, p.y);
    else if (t === 'pick') PT.pick(p.x, p.y);
    else if (t === 'hand') PE.pan = { x: l.x, y: l.y, ox: PT.view.ox, oy: PT.view.oy };
    else PE.drag = { kind: t, a: p, b: p };
  },
  move(l) {
    if (PE.pan) { PT.view.ox = PE.pan.ox + l.x - PE.pan.x; PT.view.oy = PE.pan.oy + l.y - PE.pan.y; P2.redraw(); return; }
    if (!PE.drag) return; const p = toDoc(l);
    if (PE.drag.brush) PT.move(p.x, p.y, PE.drag.pen ? l.e.pressure : 1); else if (PE.drag.kind) { PE.drag.b = p; P2.redraw(); }
  },
  up() {
    if (PE.pan) { PE.pan = null; return; }
    const dr = PE.drag; PE.drag = null; if (!dr) return;
    if (dr.brush) PT.end(); else if (dr.kind) PT.shape(dr.kind, dr.a, dr.b);
  },
  wheel(l, dy) {
    const v = PT.view, k = dy < 0 ? 1.15 : 1 / 1.15, p = toDoc(l), d = PT.cur(); v.s = clamp(v.s * k, 0.05, 12);
    v.ox = l.x - P2.w / 2 - (p.x - d.size / 2) * v.s; v.oy = l.y - P2.h / 2 - (p.y - d.size / 2) * v.s; P2.redraw();
  }
};

/* ---- 3D-Malen direkt auf dem Modell ---- */
F.tools.paint3d = {
  cursor: 'crosshair', last: null, enter() { }, leave() { },
  down(e) {
    const o = S.active; if (!PT.paint3d || !o || !o.isMesh) return false;
    if (!o.geometry.attributes.uv) { F.say('Dieses Objekt hat keine UVs – im Textur-Panel „UV erzeugen“ klicken', 'err'); return false; }
    const slot = PT.slot; if (!PT.doc(slot).assigned || PT.doc(slot).target !== o) PT.assign(slot, true);
    const h = V.ray(e).intersectObject(o, false)[0]; if (!h || !h.uv) return false;
    const d = PT.cur(), p = { x: h.uv.x * d.size, y: (1 - h.uv.y) * d.size };
    if (PT.tool !== 'brush' && PT.tool !== 'eraser') PT.tool = 'brush';
    PT.begin(p.x, p.y, e.pointerType === 'pen' ? e.pressure : 1); this.last = h.uv.clone(); return true;
  },
  move(e) {
    const o = S.active; if (!o || !PT.stroke) return; const h = V.ray(e).intersectObject(o, false)[0]; if (!h || !h.uv) return;
    const d = PT.cur(); if (this.last && this.last.distanceTo(h.uv) > 0.25) { PT.stroke.last = { x: h.uv.x * d.size, y: (1 - h.uv.y) * d.size }; this.last = h.uv.clone(); return; }
    PT.move(h.uv.x * d.size, (1 - h.uv.y) * d.size, e.pointerType === 'pen' ? e.pressure : 1); this.last = h.uv.clone();
  },
  up() { PT.end(); }
};
