/* ============================================================
   Fotomodus: Objekt aus Fotos (Rundgang oder Drehteller), komplett lokal.
   Verfahren:
   1. Maske: Hintergrund aus dem Bildrand schätzen (Farbebene, Schattentoleranz)
      oder Alpha-Kanal; per Pinsel korrigierbar.
   2. Kamera: Rundum-Modell (Blick zur Mitte, gleicher Abstand). Elevation,
      Brennweite und Drehrichtung werden durch Suche bestimmt, die Winkel
      danach je Foto nachgezogen.
   3. Form: Sichtkörper aus allen Silhouetten als Distanzfeld (Maximum der
      Silhouetten-Abstände) → Surface Nets → Taubin-Glättung.
   4. Textur: je Dreieck der beste Blickwinkel (Sichtbarkeit per Z-Buffer),
      Zuordnung geglättet, Atlas aus Foto-Ausschnitten.
   Grenzen: Mulden und Hohlräume sieht ein Sichtkörper nicht; Glas und Spiegel
   gehen nicht; ein einfarbiger Untergrund hilft stark.
   ============================================================ */
F.photo = (function () {
  const PH = { views: [], sel: 0, tool: 'view', brush: 22, stripOff: 0, busy: false, last: null, zoom: { s: 1, ox: 0, oy: 0 }, hover: null };
  const CFG = PH.cfg = { range: 360, dir: 0, elev: 20, f35: 26, autoCal: true, refine: true, k: 1, res: 128, smooth: 3, tol: 1, tex: true, texSize: 2048, gain: true, size: 1, work: 512 };
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const tick = () => F.vox.tick();
  const say = (m, k) => F.say(m, k || '', true);
  const natural = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

  /* ---------------- Bilder lesen ---------------- */
  async function decode(src) {
    if (src && src.getContext) return { img: src, w: src.width, h: src.height };
    let bmp = null;
    try { bmp = await createImageBitmap(src, { imageOrientation: 'from-image' }); } catch (e) { try { bmp = await createImageBitmap(src); } catch (e2) { bmp = null; } }
    if (bmp) return { img: bmp, w: bmp.width, h: bmp.height, close: () => { try { bmp.close(); } catch (e) { } } };
    const url = URL.createObjectURL(src);
    try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild nicht lesbar: ' + (src.name || ''))); i.src = url; }); return { img: im, w: im.naturalWidth, h: im.naturalHeight }; }
    finally { setTimeout(() => URL.revokeObjectURL(url), 8000); }
  }
  async function makeView(src, name) {
    const d = await decode(src), sc = Math.min(1, CFG.work / Math.max(d.w, d.h)), w = Math.max(8, Math.round(d.w * sc)), hh = Math.max(8, Math.round(d.h * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(d.img, 0, 0, w, hh);
    const data = x.getImageData(0, 0, w, hh).data; if (d.close) d.close();
    return { name, src, sw: d.w, sh: d.h, w, h: hh, canvas: c, data, mask: null, sdf: null, skip: false, manual: false, warn: '', az0: 0, az: 0, daz: 0, mc: null, bgRGB: null };
  }

  /* ---------------- Maske ---------------- */
  const S2L = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const labF = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  function toLab(r, g, b, out, o) {
    const R = S2L[r], G = S2L[g], B = S2L[b];
    const x = labF((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047), y = labF(0.2126729 * R + 0.7151522 * G + 0.072175 * B), z = labF((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
    out[o] = 116 * y - 16; out[o + 1] = 500 * (x - y); out[o + 2] = 200 * (y - z);
  }
  function solve3(m) { // Gauß mit Pivot, 3×4
    for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; const t = m[c]; m[c] = m[p]; m[p] = t; const d = m[c][c] || 1e-9; for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / d; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; } }
    return [m[0][3] / (m[0][0] || 1e-9), m[1][3] / (m[1][1] || 1e-9), m[2][3] / (m[2][2] || 1e-9)];
  }
  function fitPlane(xs, ys, vs, keep) { // v = a + b·x + c·y über die Punkte mit keep=1
    let n = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0, Syy = 0, Sv = 0, Sxv = 0, Syv = 0;
    for (let i = 0; i < xs.length; i++) { if (!keep[i]) continue; const x = xs[i], y = ys[i], v = vs[i]; n++; Sx += x; Sy += y; Sxx += x * x; Sxy += x * y; Syy += y * y; Sv += v; Sxv += x * v; Syv += y * v; }
    if (n < 6) return [Sv / Math.max(1, n), 0, 0];
    return solve3([[n, Sx, Sy, Sv], [Sx, Sxx, Sxy, Sxv], [Sy, Sxy, Syy, Syv]]);
  }
  function median(a) { const b = Array.from(a).sort((p, q) => p - q); return b.length ? b[b.length >> 1] : 0; }
  function boxBlur(src, w, h) {
    const t = new Float32Array(src.length), o = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; t[i] = (src[x > 0 ? i - 1 : i] + src[i] + src[x < w - 1 ? i + 1 : i]) / 3; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; o[i] = (t[y > 0 ? i - w : i] + t[i] + t[y < h - 1 ? i + w : i]) / 3; }
    return o;
  }
  function cleanup(m, w, h) {
    const n = w * h, t = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { t[i] = m[i]; continue; } t[i] = (m[i - w - 1] + m[i - w] + m[i - w + 1] + m[i - 1] + m[i] + m[i + 1] + m[i + w - 1] + m[i + w] + m[i + w + 1]) >= 5 ? 1 : 0; }
    m.set(t);
    const lab = new Int32Array(n).fill(-1), q = new Int32Array(n), sizes = [];
    const flood = (s, val, id) => { let qh = 0, qt = 0, cnt = 0, border = false; q[qt++] = s; lab[s] = id; while (qh < qt) { const p = q[qh++]; cnt++; const x = p % w, y = (p / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true; if (x > 0 && lab[p - 1] < 0 && m[p - 1] === val) { lab[p - 1] = id; q[qt++] = p - 1; } if (x < w - 1 && lab[p + 1] < 0 && m[p + 1] === val) { lab[p + 1] = id; q[qt++] = p + 1; } if (y > 0 && lab[p - w] < 0 && m[p - w] === val) { lab[p - w] = id; q[qt++] = p - w; } if (y < h - 1 && lab[p + w] < 0 && m[p + w] === val) { lab[p + w] = id; q[qt++] = p + w; } } return { cnt, border, qt }; };
    let big = 0; const comps = [];
    for (let i = 0; i < n; i++) if (m[i] && lab[i] < 0) { const id = comps.length, r = flood(i, 1, id); comps.push(r.cnt); if (r.cnt > big) big = r.cnt; }
    const minKeep = Math.max(40, big * 0.2); for (let i = 0; i < n; i++) if (m[i] && comps[lab[i]] < minKeep) m[i] = 0;
    // kleine Löcher füllen (Hintergrund, der den Rand nicht erreicht)
    lab.fill(-1); const lim = Math.max(30, n * 0.004); let id = 1000000;
    for (let i = 0; i < n; i++) if (!m[i] && lab[i] < 0) { const r = flood(i, 0, id++); if (!r.border && r.cnt <= lim) for (let k = 0; k < r.qt; k++) m[q[k]] = 1; }
  }
  function maskStats(v) {
    const { w, h, mask } = v; let x0 = w, y0 = h, x1 = -1, y1 = -1, a = 0, edge = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { a++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge++; }
    v.area = a; v.bb = a ? [x0, y0, x1 + 1, y1 + 1] : [0, 0, w, h]; v.pcx = (v.bb[0] + v.bb[2]) / 2; v.pcy = (v.bb[1] + v.bb[3]) / 2; v.pcx0 = v.pcx; v.pcy0 = v.pcy;
    v.warn = ''; const fr = a / (w * h);
    if (fr < 0.012) v.warn = 'Objekt kaum erkannt – Maske prüfen'; else if (fr > 0.88) v.warn = 'Hintergrund nicht erkannt – Maske prüfen'; else if (edge > 0.03 * (w + h) * 2) v.warn = 'Objekt am Bildrand abgeschnitten';
    v.mc = null; v.sdf = null; v.mcDirty = true;
  }
  function segment(v, k) {
    const { w, h, data } = v, n = w * h, m = new Uint8Array(n); let tr = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 200) tr++;
    v.alpha = tr > n * 0.004;
    if (v.alpha) { for (let i = 0; i < n; i++) m[i] = data[i * 4 + 3] >= 128 ? 1 : 0; v.bgRGB = null; }
    else {
      const L = new Float32Array(n * 3); for (let i = 0; i < n; i++) toLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], L, i * 3);
      const bw = Math.max(3, Math.round(0.045 * Math.min(w, h))), xs = [], ys = [], ix = [];
      for (let y = 0; y < h; y += 2) { const edgeRow = y < bw || y >= h - bw; for (let x = 0; x < w; x += edgeRow ? 2 : 1) { if (!edgeRow && x >= bw && x < w - bw) { x = w - bw - 1; continue; } xs.push(x / w - 0.5); ys.push(y / h - 0.5); ix.push(y * w + x); } }
      const co = [], sg = []; let ss = 0;
      for (let c = 0; c < 3; c++) {
        const vals = ix.map(i => L[i * 3 + c]), keep = new Uint8Array(ix.length).fill(1); let pl = fitPlane(xs, ys, vals, keep), sd = 1;
        for (let it = 0; it < 3; it++) { const res = vals.map((v, i) => Math.abs(v - (pl[0] + pl[1] * xs[i] + pl[2] * ys[i]))); sd = 1.4826 * median(res) + 0.4; for (let i = 0; i < res.length; i++) keep[i] = res[i] < 2.5 * sd ? 1 : 0; pl = fitPlane(xs, ys, vals, keep); }
        co.push(pl); sg.push(sd); ss += sd * sd;
      }
      const s = clamp(Math.sqrt(ss), 1.2, 9), T = Math.max(6, 3 * s) * k, dist = new Float32Array(n);
      for (let y = 0; y < h; y++) { const yn = y / h - 0.5; for (let x = 0; x < w; x++) { const i = y * w + x, xn = x / w - 0.5, dL = L[i * 3] - (co[0][0] + co[0][1] * xn + co[0][2] * yn), da = L[i * 3 + 1] - (co[1][0] + co[1][1] * xn + co[1][2] * yn), db = L[i * 3 + 2] - (co[2][0] + co[2][1] * xn + co[2][2] * yn), dab = Math.sqrt(da * da + db * db);
        dist[i] = (dL < 0 && dL > -30 && dab < 8) ? dab * 1.3 : Math.sqrt(dL * dL + 1.6 * dab * dab); } }
      const db = boxBlur(dist, w, h); for (let i = 0; i < n; i++) m[i] = db[i] > T ? 1 : 0;
      v.bgRGB = [0, 1, 2].map(c => median(ix.map(i => data[i * 4 + c])));
    }
    cleanup(m, w, h); v.mask = m; v.manual = false; maskStats(v);
  }

  /* ---------------- Distanzfeld einer Maske (Pixel, außen positiv) ---------------- */
  function dt1(f, n, d, vv, z) {
    let k = 0; vv[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (let q = 1; q < n; q++) { let s = ((f[q] + q * q) - (f[vv[k]] + vv[k] * vv[k])) / (2 * q - 2 * vv[k]); while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[vv[k]] + vv[k] * vv[k])) / (2 * q - 2 * vv[k]); } k++; vv[k] = q; z[k] = s; z[k + 1] = 1e20; }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const dq = q - vv[k]; d[q] = dq * dq + f[vv[k]]; }
  }
  function edt(g, w, h) {
    const m = Math.max(w, h), f = new Float64Array(m), d = new Float64Array(m), vv = new Int32Array(m), z = new Float64Array(m + 1);
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; dt1(f, h, d, vv, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; dt1(f, w, d, vv, z); for (let x = 0; x < w; x++) g[y * w + x] = d[x]; }
  }
  function sdfFromMask(mask, w, h) {
    const n = w * h, a = new Float32Array(n), b = new Float32Array(n), out = new Float32Array(n); let any = false;
    for (let i = 0; i < n; i++) { if (mask[i]) { any = true; a[i] = 0; b[i] = 1e20; } else { a[i] = 1e20; b[i] = 0; } }
    if (!any) { out.fill(1e4); return out; }
    edt(a, w, h); edt(b, w, h);
    for (let i = 0; i < n; i++) out[i] = mask[i] ? -(Math.sqrt(Math.min(b[i], 1e18)) - 0.5) : Math.sqrt(a[i]) - 0.5;
    return out;
  }
  function bil(a, w, h, x, y) {
    x -= 0.5; y -= 0.5; let x0 = Math.floor(x), y0 = Math.floor(y); const fx = x - x0, fy = y - y0; let x1 = x0 + 1, y1 = y0 + 1;
    x0 = x0 < 0 ? 0 : x0 >= w ? w - 1 : x0; x1 = x1 < 0 ? 0 : x1 >= w ? w - 1 : x1; y0 = y0 < 0 ? 0 : y0 >= h ? h - 1 : y0; y1 = y1 < 0 ? 0 : y1 >= h ? h - 1 : y1;
    const a0 = a[y0 * w + x0], a1 = a[y0 * w + x1], b0 = a[y1 * w + x0], b1 = a[y1 * w + x1];
    return (a0 + (a1 - a0) * fx) * (1 - fy) + (b0 + (b1 - b0) * fx) * fy;
  }

  /* ---------------- Kameras ---------------- */
  /* Hauptpunkt: gemeinsamer Wert aller Fotos (Median der Maskenmitten); liegt er nahe der Bildmitte, wird er dort eingerastet */
  function principal(vs) {
    const mx = median(vs.map(v => v.pcx0 === undefined ? v.pcx : v.pcx0)), my = median(vs.map(v => v.pcy0 === undefined ? v.pcy : v.pcy0));
    vs.forEach(v => { if (v.pcx0 === undefined) { v.pcx0 = v.pcx; v.pcy0 = v.pcy; } const nearX = Math.abs(mx / v.w - 0.5) < 0.06, nearY = Math.abs(my / v.h - 0.5) < 0.06; v.pcx = nearX ? v.w / 2 : mx / v.w * v.w; v.pcy = nearY ? v.h / 2 : my / v.h * v.h; v.dx = 0; v.dy = 0; });
  }
  function azimuths(vs) { const n = vs.length, step = CFG.range >= 359.5 ? 360 / n : CFG.range / Math.max(1, n - 1); vs.forEach((v, i) => { v.az0 = i * step; v.az = v.az0; v.daz = 0; }); return step; }
  function initD(vs, f35) { const a = vs.map(v => (f35 / 36 * Math.max(v.w, v.h)) * 0.85 / Math.max(4, Math.max(v.bb[2] - v.bb[0], v.bb[3] - v.bb[1]) / 2)); return median(a); }
  function makeCams(vs, P) {
    const el = P.elev * DEG, ce = Math.cos(el), se = Math.sin(el);
    return vs.map(v => {
      const th = (v.az + v.daz) * DEG, dx = Math.sin(th) * ce, dy = se, dz = Math.cos(th) * ce, f = [-dx, -dy, -dz];
      let rx = -f[2], rz = f[0]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      const u = [-rz * f[1], rz * f[0] - rx * f[2], rx * f[1]], cpx = P.D * dx, cpy = P.D * dy, cpz = P.D * dz;
      return { v, r0: rx, r2: rz, u0: u[0], u1: u[1], u2: u[2], f0: f[0], f1: f[1], f2: f[2], tx: -(rx * cpx + rz * cpz), ty: -(u[0] * cpx + u[1] * cpy + u[2] * cpz), tz: -(f[0] * cpx + f[1] * cpy + f[2] * cpz), fpx: P.f35 / 36 * Math.max(v.w, v.h), cx: v.pcx + (v.dx || 0), cy: v.pcy + (v.dy || 0), w: v.w, h: v.h, mask: v.mask, sdf: v.sdf, cp: [cpx, cpy, cpz] };
    });
  }
  function lowMask(v, Ll) {
    const sc = Ll / Math.max(v.w, v.h), lw = Math.max(4, Math.round(v.w * sc)), lh = Math.max(4, Math.round(v.h * sc)), acc = new Uint16Array(lw * lh), cn = new Uint16Array(lw * lh);
    for (let y = 0; y < v.h; y++) { const ly = Math.min(lh - 1, (y * lh / v.h) | 0); for (let x = 0; x < v.w; x++) { const l = ly * lw + Math.min(lw - 1, (x * lw / v.w) | 0); cn[l]++; if (v.mask[y * v.w + x]) acc[l]++; } }
    const m = new Uint8Array(lw * lh); for (let i = 0; i < m.length; i++) m[i] = acc[i] * 2 > cn[i] ? 1 : 0; return { w: lw, h: lh, m };
  }
  /* Wie viel der Masken deckt der grobe Sichtkörper ab? (0..1) */
  function coverageScore(vs, P, lm, R, N) {
    const cams = makeCams(vs, P), nc = cams.length, hS = 2 * R / N, tol = nc >= 10 ? 1 : 0, sx = [], sy = [], sz = [];
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -R + (i + 0.5) * hS, y = -R + (j + 0.5) * hS, z = -R + (k + 0.5) * hS; let miss = 0, ok = true;
      for (let c = 0; c < nc; c++) { const C = cams[c], zc = C.f0 * x + C.f1 * y + C.f2 * z + C.tz; if (zc < 0.05) continue; const u = C.cx + C.fpx * (C.r0 * x + C.r2 * z + C.tx) / zc, w = C.cy - C.fpx * (C.u0 * x + C.u1 * y + C.u2 * z + C.ty) / zc, ix = u | 0, iy = w | 0; if (u < 0 || w < 0 || ix >= C.w || iy >= C.h || !C.mask[iy * C.w + ix]) { if (++miss > tol) { ok = false; break; } } }
      if (ok) { sx.push(x); sy.push(y); sz.push(z); }
    }
    if (sx.length < 4) return 0; let tot = 0;
    for (let c = 0; c < nc; c++) {
      const C = cams[c], L = lm[c], cov = new Uint8Array(L.w * L.h), kx = L.w / C.w, ky = L.h / C.h;
      for (let i = 0; i < sx.length; i++) { const x = sx[i], y = sy[i], z = sz[i], zc = C.f0 * x + C.f1 * y + C.f2 * z + C.tz; if (zc < 0.05) continue; const lu = (C.cx + C.fpx * (C.r0 * x + C.r2 * z + C.tx) / zc) * kx, lv = (C.cy - C.fpx * (C.u0 * x + C.u1 * y + C.u2 * z + C.ty) / zc) * ky, r = Math.max(0, Math.round(hS * C.fpx / zc * kx * 0.5));
        const xa = Math.max(0, Math.floor(lu - r)), xb = Math.min(L.w - 1, Math.floor(lu + r)), ya = Math.max(0, Math.floor(lv - r)), yb = Math.min(L.h - 1, Math.floor(lv + r)); for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) cov[yy * L.w + xx] = 1; }
      let a = 0, b = 0; for (let p = 0; p < cov.length; p++) { const m = L.m[p], q = cov[p]; if (m || q) { a++; if (m && q) b++; } } tot += a ? b / a : 0;
    }
    return tot / nc;
  }
  function pickSubset(vs, n) { if (vs.length <= n) return vs.slice(); const o = []; for (let i = 0; i < n; i++) o.push(vs[Math.floor(i * vs.length / n)]); return o; }

  async function calibrate(vs) {
    const sub = pickSubset(vs, 12), lm = sub.map(v => lowMask(v, 72)); let evals = 0;
    const ev = async (el, f35, dir) => { sub.forEach(v => { v.az = dir * v.az0; v.daz = 0; }); const P = { elev: el, f35, D: initD(sub, f35) }; const s = coverageScore(sub, P, lm, 1.4, 36) - (CFG.autoCal ? 0.04 * Math.abs(Math.log2(f35 / 27)) : 0); if (++evals % 10 === 0) await tick(); return s; };
    let best = { s: -1, el: CFG.elev, f: CFG.f35, dir: CFG.dir || 1 };
    const dirs = CFG.dir === 0 ? [1, -1] : [CFG.dir], els = CFG.autoCal ? [-10, 0, 10, 20, 30, 40, 50, 60, 70] : [CFG.elev], fs = CFG.autoCal ? [20, 26, 35, 50] : [CFG.f35];
    for (const dir of dirs) for (const el of els) for (const f of fs) { const s = await ev(el, f, dir); if (s > best.s) best = { s, el, f, dir }; }
    if (CFG.autoCal) {
      let de = 5, ff = 1.15;
      for (let r = 0; r < 4; r++) { for (let guard = 0; guard < 6; guard++) { let imp = false; for (const c of [[best.el + de, best.f], [best.el - de, best.f], [best.el, best.f * ff], [best.el, best.f / ff]]) { const el = clamp(c[0], -30, 85), f = clamp(c[1], 16, 70), s = await ev(el, f, best.dir); if (s > best.s + 1e-4) { best = { s, el, f, dir: best.dir }; imp = true; } } if (!imp) break; } de /= 2; ff = 1 + (ff - 1) / 2; }
    }
    if (CFG.autoCal && vs.length >= 8) { // Feinstufe: feineres Raster, mehr Fotos
      const sub2 = pickSubset(vs, 16), lm2 = sub2.map(v => lowMask(v, 96)); sub2.forEach(v => { v.az = best.dir * v.az0; v.daz = 0; });
      const ev2 = async (el, f35) => { const P = { elev: el, f35, D: initD(sub2, f35) }; const s2 = coverageScore(sub2, P, lm2, 1.4, 52) - 0.03 * Math.abs(Math.log2(f35 / 27)); await tick(); return s2; };
      let b2 = { s: await ev2(best.el, best.f), el: best.el, f: best.f };
      for (const del of [-8, -6, -4, -2, 0, 2, 4, 6, 8]) for (const fm of [0.85, 1, 1.18]) { const el = clamp(best.el + del, -30, 85), f = clamp(best.f * fm, 16, 70); if (!del && fm === 1) continue; const s2 = await ev2(el, f); if (s2 > b2.s) b2 = { s: s2, el, f }; }
      best = { s: b2.s, el: b2.el, f: b2.f, dir: best.dir };
    }
    return { elev: best.el, f35: best.f, dir: best.dir, score: best.s };
  }

  /* Winkel je Foto nachziehen: das Foto soll zum Sichtkörper der anderen passen */
  async function refineAz(vs, P, step) {
    if (vs.length < 6) return; const R = 1.4, N = 44, hS = 2 * R / N, M = N * N * N, X = new Float32Array(M), Y = new Float32Array(M), Z = new Float32Array(M);
    for (let k = 0, p = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, p++) { X[p] = -R + (i + 0.5) * hS; Y[p] = -R + (j + 0.5) * hS; Z[p] = -R + (k + 0.5) * hS; }
    const lm = vs.map(v => lowMask(v, 72)), miss = vs.map(() => new Uint8Array(M)), mc = new Uint8Array(M);
    const compMiss = (C, out, old) => { for (let p = 0; p < M; p++) { let m = 0; const zc = C.f0 * X[p] + C.f1 * Y[p] + C.f2 * Z[p] + C.tz; if (zc > 0.05) { const u = C.cx + C.fpx * (C.r0 * X[p] + C.r2 * Z[p] + C.tx) / zc, w = C.cy - C.fpx * (C.u0 * X[p] + C.u1 * Y[p] + C.u2 * Z[p] + C.ty) / zc, ix = u | 0, iy = w | 0; if (!(u >= 0 && w >= 0 && ix < C.w && iy < C.h) || !C.mask[iy * C.w + ix]) m = 1; } if (old) mc[p] += m - out[p]; else mc[p] += m; out[p] = m; } };
    let cams = makeCams(vs, P); cams.forEach((C, i) => compMiss(C, miss[i], false)); await tick();
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i], S = []; for (let p = 0; p < M; p++) if (mc[p] - miss[i][p] === 0) S.push(p); if (S.length < 40) continue;
        const L = lm[i]; let bestD = 0, bestS = -1, bestX = 0, bestY = 0; const span = 0.45 * step, cnt = 9, sh = 0.012 * Math.max(v.w, v.h), dx0 = v.dx || 0, dy0 = v.dy || 0, saveA = v.daz;
        for (let q = 0; q < cnt; q++) for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) {
          const dd = -span + 2 * span * q / (cnt - 1); v.daz = saveA + dd; v.dx = dx0 + ix * sh; v.dy = dy0 + iy * sh; const C = makeCams([v], P)[0]; v.daz = saveA; v.dx = dx0; v.dy = dy0;
          const cov = new Uint8Array(L.w * L.h), kx = L.w / C.w, ky = L.h / C.h;
          for (let s = 0; s < S.length; s++) { const p = S[s], zc = C.f0 * X[p] + C.f1 * Y[p] + C.f2 * Z[p] + C.tz; if (zc < 0.05) continue; const lu = (C.cx + C.fpx * (C.r0 * X[p] + C.r2 * Z[p] + C.tx) / zc) * kx, lv = (C.cy - C.fpx * (C.u0 * X[p] + C.u1 * Y[p] + C.u2 * Z[p] + C.ty) / zc) * ky, r = Math.max(0, Math.round(hS * C.fpx / zc * kx * 0.5)); const xa = Math.max(0, Math.floor(lu - r)), xb = Math.min(L.w - 1, Math.floor(lu + r)), ya = Math.max(0, Math.floor(lv - r)), yb = Math.min(L.h - 1, Math.floor(lv + r)); for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) cov[yy * L.w + xx] = 1; }
          let a = 0, b = 0; for (let p = 0; p < cov.length; p++) { const m = L.m[p], c2 = cov[p]; if (m || c2) { a++; if (m && c2) b++; } }
          const sc = (a ? b / a : 0) - 0.004 * Math.abs(dd) / span - 0.003 * (Math.abs(ix) + Math.abs(iy)); if (sc > bestS) { bestS = sc; bestD = dd; bestX = ix * sh; bestY = iy * sh; }
        }
        if (Math.abs(bestD) > 1e-6 || bestX || bestY) { v.daz += bestD; v.dx = dx0 + bestX; v.dy = dy0 + bestY; const C = makeCams([v], P)[0]; compMiss(C, miss[i], true); }
      }
      await tick();
    }
  }

  /* ---------------- Sichtkörper als Distanzfeld ---------------- */
  async function carveField(cams, box, res, tol, prog) {
    const size = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]), h = size / res, g = F.vox.grid(box.min, box.max, h, 2), nx = g.nx, ny = g.ny, nxy = nx * ny, N = nx * ny * g.nz, d = g.d, t2 = tol > 0 ? new Float32Array(N) : null, cut = 3 * h;
    d.fill(-Infinity); if (t2) t2.fill(-Infinity);
    let alive = new Int32Array(N); for (let i = 0; i < N; i++) alive[i] = i; let na = N;
    const order = cams.map((_, i) => i).sort((a, b) => ((a * 0.6180339887) % 1) - ((b * 0.6180339887) % 1)), ox = g.ox, oy = g.oy, oz = g.oz;
    for (let oi = 0; oi < order.length; oi++) {
      const C = cams[order[oi]], sdf = C.sdf, W = C.w, H = C.h, fpx = C.fpx; let m = 0;
      for (let a = 0; a < na; a++) {
        const id = alive[a], k = (id / nxy) | 0, rem = id - k * nxy, j = (rem / nx) | 0, i = rem - j * nx, x = ox + i * h, y = oy + j * h, z = oz + k * h, zc = C.f0 * x + C.f1 * y + C.f2 * z + C.tz;
        if (zc < 0.05) { alive[m++] = id; continue; }
        const u = C.cx + fpx * (C.r0 * x + C.r2 * z + C.tx) / zc, w = C.cy - fpx * (C.u0 * x + C.u1 * y + C.u2 * z + C.ty) / zc;
        let val;
        if (u < 0 || w < 0 || u >= W || w >= H) { const cu = u < 0.5 ? 0.5 : u > W - 0.5 ? W - 0.5 : u, cw = w < 0.5 ? 0.5 : w > H - 0.5 ? H - 0.5 : w; val = (bil(sdf, W, H, cu, cw) + Math.hypot(u - cu, w - cw) + 0.5) * zc / fpx; }
        else val = bil(sdf, W, H, u, w) * zc / fpx;
        if (val > d[id]) { if (t2) t2[id] = d[id]; d[id] = val; } else if (t2 && val > t2[id]) t2[id] = val;
        if ((t2 ? t2[id] : d[id]) <= cut) alive[m++] = id;
      }
      na = m; if (prog) prog(oi + 1, cams.length); if (oi % 3 === 2) await tick();
    }
    for (let i = 0; i < N; i++) { let v = t2 ? t2[i] : d[i]; if (v === -Infinity) v = -cut; d[i] = v > cut ? cut : v < -cut ? -cut : v; }
    return g;
  }

  /* ---------------- Textur ---------------- */
  function packRects(rects, S, s) {
    const items = rects.map((r, i) => ({ i, w: Math.ceil(r.w * s) + 2, h: Math.ceil(r.h * s) + 2 })).sort((a, b) => b.h - a.h || b.w - a.w), pos = new Array(rects.length);
    let x = 0, y = 0, rowH = 0;
    for (const it of items) { if (it.w > S || it.h > S) return null; if (x + it.w > S) { x = 0; y += rowH; rowH = 0; } if (y + it.h > S) return null; pos[it.i] = [x, y]; x += it.w; if (it.h > rowH) rowH = it.h; }
    return pos;
  }
  async function bake(geo, vs, P, o) {
    const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array, idx = geo.index.array, Vn = pos.length / 3, T = idx.length / 3, nv = vs.length, cams = makeCams(vs, P);
    const cnt = new Uint16Array(T * nv), mar = new Uint8Array(T * nv), sx = new Float32Array(Vn), sy = new Float32Array(Vn), iz = new Float32Array(Vn), fnx = new Float32Array(T * 3), fcx = new Float32Array(T * 3);
    for (let t = 0; t < T; t++) { const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3, ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]; fnx[t * 3] = uy * vz - uz * vy; fnx[t * 3 + 1] = uz * vx - ux * vz; fnx[t * 3 + 2] = ux * vy - uy * vx; fcx[t * 3] = (pos[a] + pos[b] + pos[c]) / 3; fcx[t * 3 + 1] = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3; fcx[t * 3 + 2] = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3; }
    const proj = (C) => { for (let i = 0; i < Vn; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], zc = C.f0 * x + C.f1 * y + C.f2 * z + C.tz; iz[i] = 1 / Math.max(zc, 1e-4); sx[i] = C.cx + C.fpx * (C.r0 * x + C.r2 * z + C.tx) / zc; sy[i] = C.cy - C.fpx * (C.u0 * x + C.u1 * y + C.u2 * z + C.ty) / zc; } };
    const ids = new Int32Array(Math.max(...vs.map(v => v.w * v.h))), zb = new Float32Array(ids.length), msum = new Float32Array(T), ccount = new Int32Array(T);
    for (let c = 0; c < nv; c++) {
      const C = cams[c], W = C.w, H = C.h, sdf = C.sdf, cp = C.cp; proj(C); ids.fill(-1, 0, W * H); zb.fill(0, 0, W * H);
      for (let t = 0; t < T; t++) {
        if (fnx[t * 3] * (cp[0] - fcx[t * 3]) + fnx[t * 3 + 1] * (cp[1] - fcx[t * 3 + 1]) + fnx[t * 3 + 2] * (cp[2] - fcx[t * 3 + 2]) <= 0) continue;
        const a = idx[t * 3], b = idx[t * 3 + 1], cc = idx[t * 3 + 2], x0 = sx[a], y0 = sy[a], x1 = sx[b], y1 = sy[b], x2 = sx[cc], y2 = sy[cc], ar = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        if (Math.abs(ar) < 1e-7) continue; const inv = 1 / ar, i0 = iz[a], i1 = iz[b], i2 = iz[cc];
        const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2))), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2))), ya = Math.max(0, Math.floor(Math.min(y0, y1, y2))), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
        for (let py = ya; py <= yb; py++) for (let px = xa; px <= xb; px++) { const qx = px + 0.5, qy = py + 0.5, b0 = ((x1 - qx) * (y2 - qy) - (x2 - qx) * (y1 - qy)) * inv, b1 = ((x2 - qx) * (y0 - qy) - (x0 - qx) * (y2 - qy)) * inv, b2 = 1 - b0 - b1; if (b0 < -1e-4 || b1 < -1e-4 || b2 < -1e-4) continue; const zi = b0 * i0 + b1 * i1 + b2 * i2, p = py * W + px; if (zi > zb[p]) { zb[p] = zi; ids[p] = t; } }
      }
      msum.fill(0); ccount.fill(0);
      for (let p = 0; p < W * H; p++) { const t = ids[p]; if (t < 0) continue; ccount[t]++; const m = -sdf[p]; msum[t] += m < 0 ? 0 : m > 8 ? 8 : m; }
      for (let t = 0; t < T; t++) if (ccount[t]) { cnt[t * nv + c] = Math.min(65535, ccount[t]); mar[t * nv + c] = Math.round(msum[t] / ccount[t] * 31); }
      if (c % 3 === 2) { say('Sichtbarkeit ' + (c + 1) + '/' + nv + ' …'); await tick(); }
    }
    const score = (t, c) => { const n = cnt[t * nv + c]; return n ? n * (0.12 + 0.88 * clamp(mar[t * nv + c] / 186, 0, 1)) : 0; };
    // Nachbarschaft über gemeinsame Kanten
    const nb = new Int32Array(T * 3).fill(-1), em = new Map();
    for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const a = idx[t * 3 + k], b = idx[t * 3 + (k + 1) % 3], key = a < b ? a * Vn + b : b * Vn + a, o2 = em.get(key); if (o2 === undefined) em.set(key, t * 3 + k); else { nb[t * 3 + k] = (o2 / 3) | 0; nb[o2] = t; } }
    em.clear();
    const lab = new Int32Array(T).fill(-1), maxS = new Float32Array(T);
    for (let t = 0; t < T; t++) { let bs = 0, bc = -1; for (let c = 0; c < nv; c++) { const s = score(t, c); if (s > bs) { bs = s; bc = c; } } lab[t] = bc; maxS[t] = bs; }
    await tick();
    for (let it = 0; it < 7; it++) {
      for (let t = 0; t < T; t++) { if (maxS[t] <= 0) continue; let bl = lab[t], bcst = 1e9; const cand = [lab[t], lab[nb[t * 3]], lab[nb[t * 3 + 1]], lab[nb[t * 3 + 2]]];
        for (const L of cand) { if (L === undefined || L < 0) continue; const s = score(t, L); if (s <= 0) continue; let mism = 0; for (let k = 0; k < 3; k++) { const q = nb[t * 3 + k]; if (q >= 0 && lab[q] !== L) mism++; } const cst = (1 - s / maxS[t]) + 0.4 * mism; if (cst < bcst) { bcst = cst; bl = L; } }
        lab[t] = bl; }
    }
    for (let it = 0; it < 4; it++) for (let t = 0; t < T; t++) if (lab[t] < 0) { for (let k = 0; k < 3; k++) { const q = nb[t * 3 + k]; if (q >= 0 && lab[q] >= 0) { lab[t] = lab[q]; break; } } }
    // Charts = zusammenhängende Dreiecke mit gleichem Foto
    const chart = new Int32Array(T).fill(-1), charts = [], stack = new Int32Array(T);
    for (let t = 0; t < T; t++) { if (lab[t] < 0 || chart[t] >= 0) continue; const id = charts.length, tris = []; let sp = 0; stack[sp++] = t; chart[t] = id; while (sp) { const q = stack[--sp]; tris.push(q); for (let k = 0; k < 3; k++) { const r = nb[q * 3 + k]; if (r >= 0 && chart[r] < 0 && lab[r] === lab[t]) { chart[r] = id; stack[sp++] = r; } } } charts.push({ view: lab[t], tris }); }
    const unl = []; for (let t = 0; t < T; t++) if (lab[t] < 0) unl.push(t);
    // Rechtecke in Quellpixeln
    const byView = new Map(); charts.forEach((ch, i) => { if (!byView.has(ch.view)) byView.set(ch.view, []); byView.get(ch.view).push(i); });
    byView.forEach((list, c) => {
      const C = cams[c], v = vs[c], kx = v.sw / v.w, ky = v.sh / v.h; proj(C);
      list.forEach(i => { const ch = charts[i]; let ax = 1e9, ay = 1e9, bx = -1e9, by = -1e9; ch.tris.forEach(t => { for (let k = 0; k < 3; k++) { const q = idx[t * 3 + k], u = sx[q] * kx, w = sy[q] * ky; if (u < ax) ax = u; if (u > bx) bx = u; if (w < ay) ay = w; if (w > by) by = w; } });
        const x0 = clamp(Math.floor(ax - 1.5), 0, v.sw - 2), y0 = clamp(Math.floor(ay - 1.5), 0, v.sh - 2), x1 = clamp(Math.ceil(bx + 1.5), x0 + 2, v.sw), y1 = clamp(Math.ceil(by + 1.5), y0 + 2, v.sh); ch.x0 = x0; ch.y0 = y0; ch.w = x1 - x0; ch.h = y1 - y0; });
    });
    const S = o.texSize, rects = charts.map(ch => ({ w: ch.w, h: ch.h })); if (unl.length) rects.push({ w: 8, h: 8 });
    let lo = 0.02, hi = 1, best = null, bs = lo; for (let i = 0; i < 14; i++) { const mid = i === 0 ? 1 : (lo + hi) / 2, p = packRects(rects, S, mid); if (p) { best = p; bs = mid; lo = mid; if (i === 0) break; } else hi = mid; }
    if (!best) { best = packRects(rects, S, 0.02); bs = 0.02; }
    const sc = bs, atlas = document.createElement('canvas'); atlas.width = atlas.height = S; const ax = atlas.getContext('2d', { willReadFrequently: true }); ax.fillStyle = '#808080'; ax.fillRect(0, 0, S, S);
    // Fotos nacheinander laden und Ausschnitte einsetzen
    const gain = vs.map(v => [1, 1, 1]); if (o.gain) { const ref = [0, 1, 2].map(k => median(vs.filter(v => v.bgRGB).map(v => v.bgRGB[k]))); vs.forEach((v, i) => { if (v.bgRGB) gain[i] = [0, 1, 2].map(k => clamp(ref[k] / Math.max(8, v.bgRGB[k]), 0.7, 1.4)); }); }
    const uv = new Float32Array(T * 6);
    for (const [c, list] of byView) {
      const v = vs[c], C = cams[c], kx = v.sw / v.w, ky = v.sh / v.h; proj(C); let d = null; try { d = await decode(v.src); } catch (e) { d = null; }
      list.forEach(i => { const ch = charts[i], p = best[i], dx = p[0] + 1, dy = p[1] + 1, dw = Math.max(1, Math.round(ch.w * sc)), dh = Math.max(1, Math.round(ch.h * sc));
        if (d) { ax.drawImage(d.img, ch.x0 * d.w / v.sw, ch.y0 * d.h / v.sh, ch.w * d.w / v.sw, ch.h * d.h / v.sh, dx, dy, dw, dh); const g = gain[c]; if (o.gain && (Math.abs(g[0] - 1) > 0.02 || Math.abs(g[1] - 1) > 0.02 || Math.abs(g[2] - 1) > 0.02)) { const im = ax.getImageData(dx, dy, dw, dh), a = im.data; for (let q = 0; q < a.length; q += 4) { a[q] = Math.min(255, a[q] * g[0]); a[q + 1] = Math.min(255, a[q + 1] * g[1]); a[q + 2] = Math.min(255, a[q + 2] * g[2]); } ax.putImageData(im, dx, dy); } }
        ch.tris.forEach(t => { for (let k = 0; k < 3; k++) { const q = idx[t * 3 + k], u = (dx + (sx[q] * kx - ch.x0) * sc) / S, w = 1 - (dy + (sy[q] * ky - ch.y0) * sc) / S; uv[t * 6 + k * 2] = u; uv[t * 6 + k * 2 + 1] = w; } });
      });
      if (d && d.close) d.close(); await tick();
    }
    if (unl.length) { const p = best[charts.length]; let r = 0, g2 = 0, b = 0, n = 0; vs.forEach(v => { for (let i = 0; i < v.mask.length; i += 7) if (v.mask[i]) { r += v.data[i * 4]; g2 += v.data[i * 4 + 1]; b += v.data[i * 4 + 2]; n++; } }); n = n || 1; ax.fillStyle = 'rgb(' + Math.round(r / n) + ',' + Math.round(g2 / n) + ',' + Math.round(b / n) + ')'; ax.fillRect(p[0], p[1], 8, 8); const cu = (p[0] + 4) / S, cv = 1 - (p[1] + 4) / S; unl.forEach(t => { for (let k = 0; k < 3; k++) { uv[t * 6 + k * 2] = cu; uv[t * 6 + k * 2 + 1] = cv; } }); }
    // nicht indizierte Geometrie mit UV
    const P3 = new Float32Array(T * 9), N3 = new Float32Array(T * 9);
    for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const q = idx[t * 3 + k]; for (let e = 0; e < 3; e++) { P3[t * 9 + k * 3 + e] = pos[q * 3 + e]; N3[t * 9 + k * 3 + e] = nrm[q * 3 + e]; } }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P3, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N3, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.computeBoundingBox(); out.computeBoundingSphere();
    return { geo: out, atlas, charts: charts.length, texel: sc, unlabeled: unl.length };
  }

  /* ---------------- Hauptablauf ---------------- */
  PH.included = () => PH.views.filter(v => !v.skip);
  PH.segmentAll = function () { PH.views.forEach(v => { if (!v.manual || !v.mask) segment(v, CFG.k); }); PH.touch(); };
  PH.touch = function () { PH.views.forEach(v => { v.mcDirty = true; }); if (P2.editor === PS) P2.redraw(); };
  PH.build = async function () {
    if (PH.busy) return; const vs = PH.included();
    if (vs.length < 3) return F.say('Mindestens 3 Fotos nötig (besser 16 bis 40 rund um das Objekt)', 'err');
    PH.busy = true; if (UI.drawPanel) UI.drawPanel(true); const t0 = performance.now();
    try {
      say('Masken werden berechnet …'); vs.forEach(v => { if (!v.mask) segment(v, CFG.k); }); await tick();
      const bad = vs.filter(v => v.area < 30); if (bad.length) throw new Error('Auf ' + bad.length + ' Foto(s) wurde kein Objekt erkannt: ' + bad.slice(0, 3).map(v => v.name).join(', ') + ' – Maske prüfen oder Foto ausschließen');
      const step = azimuths(vs); principal(vs); say('Kamera wird bestimmt …');
      const cal = await calibrate(vs); vs.forEach(v => { v.az = cal.dir * v.az0; v.daz = 0; });
      const P = { elev: cal.elev, f35: cal.f35, D: initD(vs, cal.f35) };
      if (CFG.refine && vs.length >= 6) { say('Winkel je Foto werden nachgezogen …'); await refineAz(vs, P, step); }
      vs.forEach(v => { if (!v.sdf) v.sdf = sdfFromMask(v.mask, v.w, v.h); }); await tick();
      const tol = vs.length >= 16 ? CFG.tol : Math.min(CFG.tol, vs.length >= 8 ? 1 : 0);
      say('Grober Sichtkörper …'); const cams = makeCams(vs, P), R = 1.4;
      const g0 = await carveField(cams, { min: [-R, -R, -R], max: [R, R, R] }, 40, tol, null);
      let i0 = 1e9, j0 = 1e9, k0 = 1e9, i1 = -1, j1 = -1, k1 = -1, ins = 0;
      for (let k = 0; k < g0.nz; k++) for (let j = 0; j < g0.ny; j++) for (let i = 0; i < g0.nx; i++) if (g0.d[i + g0.nx * (j + g0.ny * k)] < 0) { ins++; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; if (k < k0) k0 = k; if (k > k1) k1 = k; }
      if (ins < 6) throw new Error('Kein Körper gefunden – Fotos müssen das Objekt von allen Seiten zeigen, Masken prüfen (Foto-Studio)');
      const pd = 3, mn = [g0.ox + (i0 - pd) * g0.h, g0.oy + (j0 - pd) * g0.h, g0.oz + (k0 - pd) * g0.h], mx = [g0.ox + (i1 + pd) * g0.h, g0.oy + (j1 + pd) * g0.h, g0.oz + (k1 + pd) * g0.h];
      const res = Math.min(CFG.res, 200); say('Sichtkörper wird berechnet (' + res + ') …');
      const g = await carveField(cams, { min: mn, max: mx }, res, tol, (a, b) => say('Sichtkörper ' + a + '/' + b + ' …'));
      say('Fläche wird extrahiert …'); await tick();
      let geo = F.vox.surface(g, 0); if (!geo.index.count) throw new Error('Kein Netz entstanden – Maske, Drehrichtung oder Winkelbereich prüfen');
      geo = F.vox.compact(F.vox.dropSmall(geo, Math.max(80, Math.floor(geo.index.count / 3 * 0.004)))); F.vox.taubin(geo, CFG.smooth, 0.5, -0.53); geo.computeVertexNormals();
      // Größe und Lage: längste Kante = size, Mitte über dem Boden
      geo.computeBoundingBox(); const bb = geo.boundingBox, sz = bb.getSize(new THREE.Vector3()), s = CFG.size / Math.max(sz.x, sz.y, sz.z), c = bb.getCenter(new THREE.Vector3()), bminY = bb.min.y;
      geo.translate(-c.x, -bminY, -c.z); geo.scale(s, s, s);
      const tris0 = geo.index.count / 3;
      // Kamera mit derselben Verschiebung/Skalierung auf das Netz abbilden: Weltpunkt p' = (p - (c.x, bb.min.y, c.z)) * s → Kamera sieht im alten System
      const toOld = new THREE.Matrix4().makeTranslation(c.x, bminY, c.z).multiply(new THREE.Matrix4().makeScale(1 / s, 1 / s, 1 / s));
      let mesh, tex = null, info = {};
      if (CFG.tex) {
        say('Textur wird gebaut …'); const gOld = geo.clone().applyMatrix4(toOld); const r = await bake(gOld, vs, P, { texSize: CFG.texSize, gain: CFG.gain });
        r.geo.applyMatrix4(new THREE.Matrix4().makeScale(s, s, s).premultiply(new THREE.Matrix4().makeTranslation(-c.x * s, -bminY * s, -c.z * s))); r.geo.computeBoundingBox(); r.geo.computeBoundingSphere();
        tex = new THREE.CanvasTexture(r.atlas); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; info = r; geo = r.geo;
      }
      for (const v of vs) v.sdf = null;
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      const m = V.makeMaterial(new THREE.Color('#ffffff')); m.roughness = 0.9; m.metalness = 0; m.side = THREE.DoubleSide; if (tex) m.map = tex; else m.color.set('#cfc8b8');
      mesh = V.addMesh(geo, { name: 'Foto-Modell', kind: 'mesh', material: m, dropToGrid: false, position: [0, 0, 0], silent: true });
      H.push('Foto-Modell', () => V._detach(mesh), () => V._attach(mesh)); V.select(mesh); V.refreshAll(); V.frame([mesh]);
      PH.last = { elev: cal.elev, f35: cal.f35, dir: cal.dir, score: cal.score, tris: tris0, charts: info.charts || 0, ms: Math.round(performance.now() - t0), obj: mesh };
      F.say('Foto-Modell: ' + tris0.toLocaleString('de-DE') + ' Dreiecke · Elevation ' + fix(cal.elev, 0) + '° · Brennweite ' + fix(cal.f35, 0) + ' mm · ' + fix((performance.now() - t0) / 1000, 1) + ' s');
      return mesh;
    } catch (e) { F.say(e && e.message ? e.message : String(e), 'err'); console.error(e); }
    finally { for (const v of vs) v.sdf = null; PH.busy = false; if (UI.drawPanel) UI.drawPanel(true); }
  };

  /* ---------------- Fotos hinzufügen ---------------- */
  const isVideo = f => /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name || '');
  PH.addCanvases = async function (list, names) {
    for (let i = 0; i < list.length; i++) { const v = await makeView(list[i], (names && names[i]) || ('Bild ' + (PH.views.length + 1))); segment(v, CFG.k); PH.views.push(v); if (i % 4 === 3) await tick(); }
    PH.sel = Math.min(PH.sel, PH.views.length - 1); PS.fit(); PH.touch(); if (UI.drawPanel) UI.drawPanel(true);
  };
  PH.addFiles = async function (files) {
    const all = Array.from(files), vids = all.filter(isVideo), imgs = all.filter(f => !isVideo(f) && (/^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|gif|heic|heif)$/i.test(f.name || ''))).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (S.mode !== 'photo') UI.setMode('photo');
    const first = PH.views.length; let ok = 0, bad = 0;
    for (let i = 0; i < imgs.length; i++) { try { const v = await makeView(imgs[i], imgs[i].name); segment(v, CFG.k); PH.views.push(v); ok++; } catch (e) { bad++; console.warn(e); } say('Foto ' + (i + 1) + '/' + imgs.length + ' gelesen …'); if (i % 3 === 2) await tick(); }
    for (const f of vids) { try { ok += await PH.addVideo(f, 24); } catch (e) { F.say(e.message, 'err'); bad++; } }
    if (PH.views.length > first) PH.sel = first; PS.fit(); PH.touch(); if (UI.drawPanel) UI.drawPanel(true);
    if (ok) F.say(ok + ' Foto' + (ok > 1 ? 's' : '') + ' geladen' + (bad ? ' (' + bad + ' nicht lesbar, z. B. HEIC)' : '') + ' · „Modell berechnen“ startet die Rekonstruktion'); else if (bad) F.say('Fotos nicht lesbar – bitte JPG, PNG oder WebP verwenden', 'err');
    return ok;
  };
  PH.addVideo = async function (file, count) {
    count = count || 24; const url = URL.createObjectURL(file), vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.preload = 'auto';
    try {
      await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('Video konnte nicht gelesen werden (Format oder Browser-Sperre) – besser Einzelbilder verwenden')), 15000); vid.onloadedmetadata = () => { clearTimeout(to); res(); }; vid.onerror = () => { clearTimeout(to); rej(new Error('Video konnte nicht gelesen werden (Format oder Browser-Sperre) – besser Einzelbilder verwenden')); }; vid.src = url; });
      const dur = vid.duration; if (!isFinite(dur) || dur <= 0) throw new Error('Video ohne Dauer – bitte Einzelbilder verwenden');
      const cs = [], nm = []; for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count * dur; await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('Video-Suche hängt – bitte Einzelbilder verwenden')), 8000); vid.onseeked = () => { clearTimeout(to); res(); }; vid.currentTime = t; });
        const sc = Math.min(1, 1280 / Math.max(vid.videoWidth, vid.videoHeight)), c = document.createElement('canvas'); c.width = Math.round(vid.videoWidth * sc); c.height = Math.round(vid.videoHeight * sc); c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height); cs.push(c); nm.push((file.name || 'Video').replace(/\.[^.]+$/, '') + ' ' + (k + 1)); say('Bild ' + (k + 1) + '/' + count + ' aus dem Video …');
      }
      await PH.addCanvases(cs, nm); return cs.length;
    } finally { URL.revokeObjectURL(url); vid.removeAttribute('src'); }
  };
  PH.clear = function () { PH.views = []; PH.sel = 0; PH.last = null; PS.fit(); if (P2.editor === PS) P2.redraw(); if (UI.drawPanel) UI.drawPanel(true); };

  /* ---------------- Testaufnahmen aus der Szene (zum Ausprobieren ohne Fotos) ---------------- */
  PH.simulate = async function (o) {
    o = o || {}; const n = o.n || 24, W = o.w || 800, Hh = o.h || 600, el = o.elev === undefined ? 22 : o.elev, f35 = o.f35 || 30, objs = V.objects().filter(m => m.visible);
    if (!objs.length) throw new Error('Keine Objekte in der Szene – zuerst ein Modell laden');
    const bb = new THREE.Box3(); objs.forEach(m => bb.expandByObject(m)); const c0 = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()), r0 = sz.length() / 2 * 0.84, tanV = 18 / f35 * Hh / W, D = r0 / Math.sin(Math.atan(tanV * 0.92));
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = Hh;
    const rr = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }); rr.setPixelRatio(1); rr.setSize(W, Hh, false); rr.outputEncoding = THREE.sRGBEncoding; rr.setClearColor(0x000000, 0);
    const sc = new THREE.Scene(); objs.forEach(m => { m.updateWorldMatrix(true, false); const c = new THREE.Mesh(m.geometry, m.material); c.matrixAutoUpdate = false; c.matrix.copy(m.matrixWorld); sc.add(c); });
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8d8a85, 0.85)); const cam = new THREE.PerspectiveCamera(2 * Math.atan(tanV) / DEG, W / Hh, D * 0.05, D * 6), dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(0.6, 0.9, 1); cam.add(dl); sc.add(cam);
    const outs = [], names = [], ce = Math.cos(el * DEG), se = Math.sin(el * DEG), foot = new THREE.Vector3(c0.x, bb.min.y, c0.z);
    for (let i = 0; i < n; i++) {
      const th = i / n * Math.PI * 2; cam.position.set(c0.x + D * Math.sin(th) * ce, c0.y + D * se, c0.z + D * Math.cos(th) * ce); cam.lookAt(c0); cam.updateMatrixWorld(true); rr.render(sc, cam);
      const out = document.createElement('canvas'); out.width = W; out.height = Hh; const x = out.getContext('2d', { willReadFrequently: true });
      if (o.alpha) { x.drawImage(canvas, 0, 0); outs.push(out); names.push('Test ' + String(i + 1).padStart(2, '0')); continue; }
      const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#dcd8d0'); g.addColorStop(1, '#bfbab1'); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
      const fp = foot.clone().project(cam), fx = (fp.x * 0.5 + 0.5) * W, fy = (-fp.y * 0.5 + 0.5) * Hh, rx = W * 0.2, sg = x.createRadialGradient(fx, fy, 2, fx, fy, rx); sg.addColorStop(0, 'rgba(40,36,30,0.30)'); sg.addColorStop(1, 'rgba(40,36,30,0)'); x.save(); x.translate(fx, fy); x.scale(1, 0.28); x.translate(-fx, -fy); x.fillStyle = sg; x.fillRect(fx - rx, fy - rx, rx * 2, rx * 2); x.restore();
      x.drawImage(canvas, 0, 0); const im = x.getImageData(0, 0, W, Hh), a = im.data; for (let p = 0; p < a.length; p += 4) { const nz = (Math.random() - 0.5) * 6; a[p] += nz; a[p + 1] += nz; a[p + 2] += nz; } x.putImageData(im, 0, 0);
      outs.push(out); names.push('Test ' + String(i + 1).padStart(2, '0')); if (i % 4 === 3) { say('Testaufnahme ' + (i + 1) + '/' + n + ' …'); await tick(); }
    }
    rr.dispose(); try { rr.forceContextLoss(); } catch (e) { }
    PH.truth = { elev: el, f35, n };
    return { canvases: outs, names };
  };
  PH.addSimulated = async function (o) { const r = await PH.simulate(o); if (S.mode !== 'photo') UI.setMode('photo'); await PH.addCanvases(r.canvases, r.names); PH.sel = Math.max(0, PH.views.length - r.canvases.length); PS.fit(); P2.redraw(); F.say(r.canvases.length + ' Testaufnahmen aus der Szene erzeugt (Elevation ' + (o && o.elev !== undefined ? o.elev : 22) + '°, Brennweite ' + ((o && o.f35) || 30) + ' mm)'); };

  /* ---------------- Foto-Studio (2D-Fläche) ---------------- */
  const STRIP = 66;
  const PS = F.photoEditor = {
    pan: null, paint: null,
    enter() { F.say('Foto-Studio: Fotos prüfen, Maske (rot) mit dem Pinsel korrigieren. Rechte Maustaste verschiebt, Mausrad zoomt.'); },
    leave() { PS.pan = null; PS.paint = null; },
    shown() { PS.fit(); P2.redraw(); },
    fit() { const v = PH.views[PH.sel]; if (!v || !P2.w) return; const z = PH.zoom; z.s = Math.min(P2.w / v.w, (P2.h - STRIP) / v.h) * 0.96; z.ox = 0; z.oy = 0; },
    toImg(l) { const v = PH.views[PH.sel], z = PH.zoom; return { x: (l.x - P2.w / 2 - z.ox) / z.s + v.w / 2, y: (l.y - (P2.h - STRIP) / 2 - z.oy) / z.s + v.h / 2 }; },
    maskCanvas(v) {
      if (!v.mcv) { v.mcv = document.createElement('canvas'); v.mcv.width = v.w; v.mcv.height = v.h; v.mcDirty = true; }
      if (v.mcDirty && v.mask) { const x = v.mcv.getContext('2d'), im = x.createImageData(v.w, v.h), a = im.data, m = v.mask; for (let i = 0; i < m.length; i++) if (m[i]) { a[i * 4] = 224; a[i * 4 + 1] = 60; a[i * 4 + 2] = 40; a[i * 4 + 3] = 112; } x.putImageData(im, 0, 0); v.mcDirty = false; }
      return v.mcv;
    },
    stripIndex(l) { const cw = 64, n = PH.views.length, start = PH.stripOff; const i = Math.floor((l.x - 6) / (cw + 4)) + start; return i >= 0 && i < n ? i : -1; },
    draw(c, w, h) {
      c.fillStyle = cssVar('--pane-bg'); c.fillRect(0, 0, w, h); const txt = cssVar('--pane-text'), mono = '11px ' + cssVar('--font-mono');
      const v = PH.views[PH.sel];
      if (!v) { c.fillStyle = txt; c.font = '13px ' + cssVar('--font-ui'); c.textAlign = 'center'; c.fillText('Noch keine Fotos.', w / 2, h / 2 - 22); c.fillText('Rechts „Fotos wählen“ drücken oder Bilder ins Fenster ziehen –', w / 2, h / 2); c.fillText('oder „Testaufnahmen aus der Szene“ zum Ausprobieren.', w / 2, h / 2 + 20); c.textAlign = 'left'; return; }
      const z = PH.zoom, ww = v.w * z.s, hh = v.h * z.s, x0 = w / 2 + z.ox - ww / 2, y0 = (h - STRIP) / 2 + z.oy - hh / 2;
      c.save(); c.beginPath(); c.rect(0, 0, w, h - STRIP); c.clip(); c.imageSmoothingEnabled = z.s < 2; c.drawImage(v.canvas, x0, y0, ww, hh);
      if (v.mask) { c.globalAlpha = v.skip ? 0.25 : 1; c.drawImage(PS.maskCanvas(v), x0, y0, ww, hh); c.globalAlpha = 1; }
      if (v.bb && v.area) { c.strokeStyle = 'rgba(255,255,255,.55)'; c.setLineDash([4, 3]); c.lineWidth = 1; c.strokeRect(x0 + v.bb[0] * z.s, y0 + v.bb[1] * z.s, (v.bb[2] - v.bb[0]) * z.s, (v.bb[3] - v.bb[1]) * z.s); c.setLineDash([]); }
      if ((PH.tool === 'add' || PH.tool === 'sub') && PH.hover) { c.strokeStyle = PH.tool === 'add' ? '#ff8a5c' : '#9cc7ff'; c.lineWidth = 1.5; c.beginPath(); c.arc(PH.hover.x, PH.hover.y, PH.brush, 0, 7); c.stroke(); }
      c.restore();
      c.fillStyle = txt; c.font = mono; c.fillText(v.name + '  ·  ' + v.sw + '×' + v.sh + '  ·  Maske ' + (v.mask ? fix(v.area / (v.w * v.h) * 100, 0) + ' %' : '–') + (v.skip ? '  ·  ausgeschlossen' : '') + (v.alpha ? '  ·  Alpha' : ''), 10, 16);
      if (v.warn) { c.fillStyle = '#d9712b'; c.fillText('! ' + v.warn, 10, 32); }
      // Leiste
      const sy = h - STRIP; c.fillStyle = 'rgba(0,0,0,.06)'; c.fillRect(0, sy, w, STRIP); const cw = 64, ch = STRIP - 10, n = PH.views.length, per = Math.max(1, Math.floor((w - 12) / (cw + 4)));
      if (PH.sel < PH.stripOff) PH.stripOff = PH.sel; if (PH.sel >= PH.stripOff + per) PH.stripOff = PH.sel - per + 1; PH.stripOff = clamp(PH.stripOff, 0, Math.max(0, n - per));
      for (let i = PH.stripOff, k = 0; i < n && k < per; i++, k++) {
        const u = PH.views[i], x = 6 + k * (cw + 4), s = Math.min(cw / u.w, ch / u.h), tw = u.w * s, th = u.h * s; c.globalAlpha = u.skip ? 0.3 : 1; c.drawImage(u.canvas, x + (cw - tw) / 2, sy + 5 + (ch - th) / 2, tw, th); c.globalAlpha = 1;
        c.lineWidth = i === PH.sel ? 2.5 : 1; c.strokeStyle = i === PH.sel ? cssVar('--sel') : cssVar('--pane-grid-a'); c.strokeRect(x + 0.5, sy + 5.5, cw - 1, ch - 1); if (u.warn) { c.fillStyle = '#d9712b'; c.beginPath(); c.arc(x + cw - 7, sy + 12, 4, 0, 7); c.fill(); }
      }
      c.fillStyle = txt; c.fillText((PH.sel + 1) + ' / ' + n, w - 70, 16);
    },
    down(l) {
      const e = l.e, v = PH.views[PH.sel]; if (l.y > P2.h - STRIP) { const i = PS.stripIndex(l); if (i >= 0) { PH.sel = i; PS.fit(); P2.redraw(); if (UI.drawPanel) UI.drawPanel(false); } return; }
      if (!v) return; if (e.button === 1 || e.button === 2 || PH.tool === 'view') { PS.pan = { x: l.x, y: l.y, ox: PH.zoom.ox, oy: PH.zoom.oy }; return; }
      if (!v.mask) return; PS.paint = { add: PH.tool === 'add', moved: false }; PS.stamp(l);
    },
    stamp(l) {
      const v = PH.views[PH.sel]; if (!v || !v.mask || !PS.paint) return; const p = PS.toImg(l), r = PH.brush / PH.zoom.s, r2 = r * r, w = v.w, h = v.h, val = PS.paint.add ? 1 : 0;
      const xa = Math.max(0, Math.floor(p.x - r)), xb = Math.min(w - 1, Math.ceil(p.x + r)), ya = Math.max(0, Math.floor(p.y - r)), yb = Math.min(h - 1, Math.ceil(p.y + r));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y; if (dx * dx + dy * dy <= r2) v.mask[y * w + x] = val; }
      v.mcDirty = true; v.manual = true; PS.paint.moved = true; P2.redraw();
    },
    move(l) {
      PH.hover = l.y < P2.h - STRIP ? { x: l.x, y: l.y } : null;
      if (PS.pan) { PH.zoom.ox = PS.pan.ox + l.x - PS.pan.x; PH.zoom.oy = PS.pan.oy + l.y - PS.pan.y; P2.redraw(); return; }
      if (PS.paint) { PS.stamp(l); return; } if (PH.tool === 'add' || PH.tool === 'sub') P2.redraw();
    },
    up() { if (PS.paint && PS.paint.moved) { const v = PH.views[PH.sel]; maskStats(v); if (UI.drawPanel) UI.drawPanel(false); P2.redraw(); } PS.pan = null; PS.paint = null; },
    dbl(l) { if (l.y < P2.h - STRIP) { PS.fit(); P2.redraw(); } },
    wheel(l, dy) {
      if (l.y > P2.h - STRIP) { PH.stripOff = Math.max(0, PH.stripOff + (dy > 0 ? 1 : -1)); P2.redraw(); return; }
      const z = PH.zoom, f = Math.exp(-dy * 0.0015), ns = clamp(z.s * f, 0.1, 12), k = ns / z.s, cx = l.x - P2.w / 2, cy = l.y - (P2.h - STRIP) / 2; z.ox = cx - (cx - z.ox) * k; z.oy = cy - (cy - z.oy) * k; z.s = ns; P2.redraw();
    }
  };

  PH._t = { coverageScore, lowMask, makeCams, initD, azimuths, calibrate, segment, sdfFromMask, refineAz };
  PH.select = function (i) { PH.sel = clamp(i, 0, PH.views.length - 1); PS.fit(); if (P2.editor === PS) P2.redraw(); };
  return PH;
})();
