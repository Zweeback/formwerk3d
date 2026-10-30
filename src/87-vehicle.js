/* ============================================================
   Referenzmodell: Rettungswagen (VW LT, Hochdach, hellelfenbein mit
   roter Dachlinie) nach Foto. Karosserie als Distanzfeld (Hochdach,
   Fahrerhaus-Hohlraum, Scheiben, Radkästen) → Surface Nets, dazu
   Räder mit Profil, Leuchten, Innenraum und eine bemalte Textur.
   Maße in Metern, Fahrzeug blickt nach +Z, Y oben, linke Seite = +X.
   ============================================================ */
F.vehicle = (function () {
  const Q = {};
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k) => -smin(-a, -b, k);
  const ss = smooth01;

  /* ---- 2D-Polygon: Distanz (vorzeichenbehaftet) und Einrücken ---- */
  function polySDF(pts) {
    const n = pts.length;
    return (px, py) => {
      let d = (px - pts[0][0]) ** 2 + (py - pts[0][1]) ** 2, s = 1;
      for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const ex = pts[j][0] - pts[i][0], ey = pts[j][1] - pts[i][1], wx = px - pts[i][0], wy = py - pts[i][1];
        const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey))), bx = wx - ex * t, by = wy - ey * t; d = Math.min(d, bx * bx + by * by);
        const c1 = py >= pts[i][1], c2 = py < pts[j][1], c3 = ex * wy > ey * wx; if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      }
      return s * Math.sqrt(d);
    };
  }
  function inset(pts, r) {
    const n = pts.length; let A = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
    const sg = A > 0 ? 1 : -1, L = pts.map((a, i) => { const b = pts[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey); return { px: a[0] - ey / l * sg * r, py: a[1] + ex / l * sg * r, dx: ex / l, dy: ey / l }; });
    return pts.map((_, i) => { const p = L[(i + n - 1) % n], c = L[i], det = -p.dx * c.dy + c.dx * p.dy, t = (-(c.px - p.px) * c.dy + c.dx * (c.py - p.py)) / det; return [p.px + t * p.dx, p.py + t * p.dy]; });
  }
  const sdBox = (x, y, z, hx, hy, hz, r) => { r = r || 0; const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r; return Math.min(Math.max(qx, Math.max(qy, qz)), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) - r; };

  /* ---- Maße ---- */
  const HW = 1.0, ZR = -2.72, ZF = 2.64, TOP = 2.75, SILL = 0.30, AXF = 1.60, AXR = -1.40, WY = 0.36, WR = 0.36, WX = 0.80;
  const WS0 = [2.55, 1.27], WS1 = [2.12, 2.04], WL = Math.hypot(WS1[0] - WS0[0], WS1[1] - WS0[1]), WTz = (WS1[0] - WS0[0]) / WL, WTy = (WS1[1] - WS0[1]) / WL, WNz = WTy, WNy = -WTz, WANG = Math.atan2(WTz, WTy);
  const PROF = [[ZR, SILL], [ZF, SILL], [ZF, 1.10], [2.55, 1.27], [2.12, 2.04], [2.24, 2.09], [1.98, 2.62], [1.80, TOP], [-2.60, TOP], [ZR, 2.60]];
  const SIDEWIN = [[1.28, 1.25], [2.10, 1.25], [1.97, 1.93], [1.28, 1.93]];
  Q.dims = { HW, ZR, ZF, TOP, SILL, AXF, AXR, WY, WR, WX };

  Q.field = function () {
    const prof = polySDF(inset(PROF, 0.03)), win = polySDF(SIDEWIN), ZC = (ZR + ZF) / 2, HZ = (ZF - ZR) / 2;
    return function (x, y, z) {
      const ax = Math.abs(x), r = z > ZC ? 0.30 : 0.12, qx = ax - HW + r, qz = Math.abs(z - ZC) - HZ + r;
      const plan = Math.min(Math.max(qx, qz), 0) + Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - r;
      let d = smax(plan, prof(z, y) - 0.03, 0.12 + 0.2 * ss((y - 1.8) / 0.8));
      { // Fahrerhaus-Hohlraum, Scheiben
        const cav = sdBox(ax, y - 1.44, z - 1.72, 0.90, 0.52, 0.62, 0.04); d = smax(d, -cav, 0.05);
        const s = (z - WS0[0]) * WNz + (y - WS0[1]) * WNy, t = (z - WS0[0]) * WTz + (y - WS0[1]) * WTy; // Frontscheibe
        d = smax(d, -sdBox(ax, s + 0.25, t - 0.445, 0.86, 0.45, 0.375, 0.05), 0.22);
        d = smax(d, -smax(win(z, y), 0.70 - ax, 0.02), 0.20); // Seitenscheiben
      }
      for (const za of [AXF, AXR]) d = smax(d, -smax(Math.hypot(y - WY, z - za) - 0.43, 0.66 - ax, 0.03), 0.24);
      return d;
    };
  };

  /* ---- Texturatlas: Regionen und Projektion ---- */
  const AT = 2048, REG = { L: { x: 0, y: 0, w: 1008, h: 504, s: 180 }, R: { x: 1024, y: 0, w: 1008, h: 504, s: 180 }, F: { x: 0, y: 520, w: 756, h: 1008, s: 360 }, B: { x: 780, y: 520, w: 756, h: 1008, s: 360 }, T: { x: 1560, y: 520, w: 378, h: 1008, s: 180 }, D: { x: 1960, y: 520, w: 32, h: 32, s: 1 } };
  Q.REG = REG; Q.AT = AT;
  const px2uv = (px, py, out, o) => { out[o] = px / AT; out[o + 1] = 1 - py / AT; };
  function project(key, x, y, z, out, o) {
    switch (key) {
      case 'L': px2uv(REG.L.x + (2.8 - z) * 180, REG.L.y + (2.8 - y) * 180, out, o); break;
      case 'R': px2uv(REG.R.x + (z + 2.8) * 180, REG.R.y + (2.8 - y) * 180, out, o); break;
      case 'F': px2uv(REG.F.x + (x + 1.05) * 360, REG.F.y + (2.8 - y) * 360, out, o); break;
      case 'B': px2uv(REG.B.x + (1.05 - x) * 360, REG.B.y + (2.8 - y) * 360, out, o); break;
      case 'T': px2uv(REG.T.x + (1.05 - x) * 180, REG.T.y + (2.8 - z) * 180, out, o); break;
      default: px2uv(REG.D.x + 16, REG.D.y + 16, out, o);
    }
  }

  /* ---- Karosserie erzeugen ---- */
  Q.bodyGeometry = function (h) {
    h = h || 0.04; const fn = Q.field(), g = F.vox.fromField(fn, [-HW - 0.05, SILL - 0.05, ZR - 0.05], [HW + 0.05, TOP + 0.05, ZF + 0.05], h);
    const geo = F.vox.taubin(F.vox.surface(g, 0), 3, 0.5, -0.53), P = geo.attributes.position.array, N = geo.attributes.normal.array, vn = P.length / 3, C = new Float32Array(vn * 3);
    for (let v = 0; v < vn; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], ax = Math.abs(x); let m = 1;
      const cav = sdBox(ax, y - 1.44, z - 1.72, 0.90, 0.52, 0.62, 0.04); m = Math.min(m, 1 - 0.62 * ss((0.06 - cav) / 0.14));
      const ar = Math.min(Math.hypot(y - WY, z - AXF), Math.hypot(y - WY, z - AXR)) - 0.43; if (ax > 0.6) m = Math.min(m, 1 - 0.85 * ss((0.03 - ar) / 0.14));
      m = Math.min(m, 1 - 0.75 * ss((0.42 - y) / 0.12));
      C[v * 3] = C[v * 3 + 1] = C[v * 3 + 2] = m;
    }
    { const adj = F.geo.adjacency(geo); let a = C, b = new Float32Array(C.length); // Farben auf dem Netz glätten
      for (let it = 0; it < 2; it++) { for (let v = 0; v < vn; v++) { const s0 = adj.start[v], e0 = adj.start[v + 1]; let sum = 0; for (let j = s0; j < e0; j++) sum += a[adj.list[j] * 3]; const val = e0 > s0 ? 0.5 * a[v * 3] + 0.5 * sum / (e0 - s0) : a[v * 3]; b[v * 3] = b[v * 3 + 1] = b[v * 3 + 2] = val; } const t = a; a = b; b = t; }
      if (a !== C) C.set(a); }
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    // Nicht indiziert, je Dreieck eine Projektionsrichtung wählen
    const I = geo.index.array, tc = I.length / 3, pos = new Float32Array(tc * 9), nor = new Float32Array(tc * 9), col = new Float32Array(tc * 9), uv = new Float32Array(tc * 6);
    for (let t = 0; t < tc; t++) {
      let sx = 0, sy = 0, sz = 0, cy = 0; for (let k = 0; k < 3; k++) { const i = I[t * 3 + k] * 3; sx += N[i]; sy += N[i + 1]; sz += N[i + 2]; cy += P[i + 1] / 3; }
      const ax = Math.abs(sx), ay = Math.abs(sy), az = Math.abs(sz); let key;
      if (ay >= ax * 1.1 && ay >= az * 1.1 && (sy > 0 || cy < 0.5)) key = sy > 0 ? 'T' : 'D'; else if (ax >= az) key = sx > 0 ? 'L' : 'R'; else key = sz > 0 ? 'F' : 'B';
      for (let k = 0; k < 3; k++) {
        const i = I[t * 3 + k] * 3, o = t * 9 + k * 3; for (let c = 0; c < 3; c++) { pos[o + c] = P[i + c]; nor[o + c] = N[i + c]; col[o + c] = C[i + c]; }
        project(key, P[i], P[i + 1], P[i + 2], uv, t * 6 + k * 2);
      }
    }
    const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); r.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); r.setAttribute('color', new THREE.BufferAttribute(col, 3));
    r.computeBoundingSphere(); r.computeBoundingBox(); return r;
  };

  /* ---- Bausteine ---- */
  function roundedBox(w, hh, d, r, seg) {
    const g = new THREE.BoxGeometry(w, hh, d, seg, seg, seg), p = g.attributes.position, nr = g.attributes.normal, hx = w / 2 - r, hy = hh / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), cx = clamp(x, -hx, hx), cy = clamp(y, -hy, hy), cz = clamp(z, -hz, hz), dx = x - cx, dy = y - cy, dz = z - cz, l = Math.hypot(dx, dy, dz);
      if (l > 1e-9) { p.setXYZ(i, cx + dx / l * r, cy + dy / l * r, cz + dz / l * r); nr.setXYZ(i, dx / l, dy / l, dz / l); }
    }
    return g;
  }
  const xf = (g, o) => { o = o || {}; const m = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(o.p || [0, 0, 0]), new THREE.Quaternion().setFromEuler(new THREE.Euler((o.r ? o.r[0] : 0) * DEG, (o.r ? o.r[1] : 0) * DEG, (o.r ? o.r[2] : 0) * DEG, 'YXZ')), new THREE.Vector3().fromArray(o.s || [1, 1, 1])); g.applyMatrix4(m); return g; };
  const merge = list => F.geo.merge(list.filter(Boolean));
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
  const MAT = (c, r, m, o) => Object.assign({ color: c, rough: r === undefined ? 0.6 : r, metal: m || 0 }, o || {});

  /* Reifen mit Chevron-Profil und Längsrillen, Achse = X, Außenseite +X */
  Q.tireGeometry = function (NT, NS) {
    NT = NT || 216; NS = NS || 24; const R = WR, rr = 0.2032, W = 0.205, pos = new Float32Array(NT * (NS + 1) * 3), idx = [];
    for (let k = 0; k <= NS; k++) {
      const u = -1 + 2 * k / NS, a = Math.abs(u); let r, x = u * W / 2;
      if (a <= 0.72) r = R - 0.010 * (a / 0.72) ** 2; else { const t = (a - 0.72) / 0.28; r = rr + (R - 0.010 - rr) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2))); x *= 1 + 0.045 * Math.sin(Math.PI * Math.min(1, t * 1.15)); }
      for (let i = 0; i < NT; i++) {
        const th = i / NT * Math.PI * 2; let rad = r;
        if (a < 0.7) { // Profil
          const v = ((th * 36 / (Math.PI * 2) + Math.sign(u || 1) * a * 1.1) % 1 + 1) % 1; rad -= 0.0085 * ss((0.34 - v) / 0.1) * ss((a - 0.07) / 0.06);
          rad -= 0.007 * ss((0.035 - Math.abs(a - 0.40)) / 0.02) + 0.006 * ss((0.03 - a) / 0.02);
        }
        const o = (k * NT + i) * 3; pos[o] = x; pos[o + 1] = Math.cos(th) * rad; pos[o + 2] = Math.sin(th) * rad;
      }
    }
    for (let k = 0; k < NS; k++) for (let i = 0; i < NT; i++) { const a = k * NT + i, b = k * NT + (i + 1) % NT, c = (k + 1) * NT + i, d = (k + 1) * NT + (i + 1) % NT; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // Seitenrichtung prüfen: Normalen müssen nach außen zeigen
    const n = g.attributes.normal, mid = ((NS / 2) * NT) * 3; if (n.array[mid + 1] * pos[mid + 1] + n.array[mid + 2] * pos[mid + 2] < 0) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } g.computeVertexNormals(); }
    return g;
  };
  Q.rimGeometry = function () {
    const prof = [[0.215, -0.095], [0.215, -0.082], [0.207, -0.074], [0.198, -0.056], [0.198, 0.040], [0.207, 0.058], [0.215, 0.070], [0.215, 0.080], [0.208, 0.086], [0.190, 0.082], [0.172, 0.074], [0.150, 0.072], [0.118, 0.080], [0.090, 0.088], [0.070, 0.090], [0.070, 0.074], [0.0, 0.074]].reverse();
    const rim = lathe(prof, 96).rotateZ(-Math.PI / 2), parts = [rim];
    parts.push(lathe([[0.072, 0.090], [0.072, 0.098], [0.062, 0.108], [0.040, 0.116], [0.0, 0.119]], 48).rotateZ(-Math.PI / 2));
    for (let i = 0; i < 5; i++) { // Radmuttern und Lüftungsöffnungen
      const a = i / 5 * Math.PI * 2; parts.push(xf(new THREE.CylinderGeometry(0.0125, 0.0125, 0.02, 6).rotateZ(-Math.PI / 2), { p: [0.094, Math.cos(a) * 0.098, Math.sin(a) * 0.098] }));
      const b = a + Math.PI / 5; parts.push(xf(new THREE.CylinderGeometry(0.030, 0.030, 0.003, 20).rotateZ(-Math.PI / 2), { p: [0.0775, Math.cos(b) * 0.150, Math.sin(b) * 0.150], s: [1, 1.25, 0.7], r: [0, 0, 0] }));
    }
    return merge(parts);
  };

  function glassFlat(w, hh, t) { return new THREE.BoxGeometry(w, hh, t, 1, 1, 1); }
  function sideGlass(sign) {
    const s = new THREE.Shape(); SIDEWIN.forEach((p, i) => { const a = p[0] + (i === 0 || i === 3 ? 0.03 : -0.0), b = p[1]; if (i === 0) s.moveTo(a, b); else s.lineTo(a, b); }); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false }); // Shape-X = z, Shape-Y = y, Extrusion = x
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1)); g.translate(0.93 * sign, 0, 0); return g;
  }

  /* ---- Textur (Canvas) ---- */
  const cream = '#e4d7b6', red = '#ea4a2f';
  function rr2(c, x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function shield(c, x, y, w, hh, kind) {
    c.save(); c.beginPath(); c.moveTo(x - w / 2, y - hh / 2); c.lineTo(x + w / 2, y - hh / 2); c.lineTo(x + w / 2, y + hh * 0.1); c.quadraticCurveTo(x + w / 2, y + hh / 2, x, y + hh / 2); c.quadraticCurveTo(x - w / 2, y + hh / 2, x - w / 2, y + hh * 0.1); c.closePath();
    if (kind === 'cross') { c.fillStyle = '#d9302a'; c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1, w * 0.04); c.stroke(); // achtspitziges Kreuz
      c.fillStyle = '#fff'; const u = w * 0.30, cx = x, cy = y - hh * 0.02; for (let i = 0; i < 4; i++) { c.save(); c.translate(cx, cy); c.rotate(i * Math.PI / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(-u * 0.55, -u * 1.05); c.lineTo(0, -u * 0.78); c.lineTo(u * 0.55, -u * 1.05); c.closePath(); c.fill(); c.restore(); } }
    else { c.fillStyle = '#f2efe6'; c.fill(); c.strokeStyle = '#7a6f58'; c.lineWidth = Math.max(1, w * 0.04); c.stroke(); c.clip(); c.fillStyle = '#c9362e'; c.beginPath(); c.moveTo(x - w / 2, y - hh * 0.05); c.lineTo(x, y - hh * 0.42); c.lineTo(x + w / 2, y - hh * 0.05); c.lineTo(x + w / 2, y + hh * 0.10); c.lineTo(x, y - hh * 0.22); c.lineTo(x - w / 2, y + hh * 0.10); c.closePath(); c.fill(); c.fillStyle = '#c9362e'; c.fillRect(x - w * 0.06, y - hh * 0.10, w * 0.12, hh * 0.55); c.fillRect(x - w * 0.22, y + hh * 0.08, w * 0.44, hh * 0.10); }
    c.restore();
  }
  Q.texture = function (opt) {
    opt = opt || {}; const cv = document.createElement('canvas'); cv.width = cv.height = AT; const c = cv.getContext('2d'); if (!c) return null;
    c.fillStyle = cream; c.fillRect(0, 0, AT, AT);
    // Region -> Pixel
    const sideP = (reg, flip) => (z, y) => [reg.x + (flip ? (z + 2.8) : (2.8 - z)) * 180, reg.y + (2.8 - y) * 180], frontP = (x, y) => [REG.F.x + (x + 1.05) * 360, REG.F.y + (2.8 - y) * 360], backP = (x, y) => [REG.B.x + (1.05 - x) * 360, REG.B.y + (2.8 - y) * 360], topP = (x, z) => [REG.T.x + (1.05 - x) * 180, REG.T.y + (2.8 - z) * 180];
    const rect = (P, a0, b0, a1, b1, col) => { const p = P(a0, b0), q = P(a1, b1); c.fillStyle = col; c.fillRect(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])); };
    const poly = (P, pts, stroke, w, fill) => { c.beginPath(); pts.forEach((q, i) => { const p = P(q[0], q[1]); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = w; c.stroke(); } };
    const dirt = (reg) => { const g = c.createLinearGradient(0, reg.y + reg.h, 0, reg.y + reg.h - 1.0 * reg.s); g.addColorStop(0, 'rgba(92,78,56,0.55)'); g.addColorStop(0.35, 'rgba(92,78,56,0.18)'); g.addColorStop(1, 'rgba(92,78,56,0)'); c.fillStyle = g; c.fillRect(reg.x, reg.y, reg.w, reg.h); };
    const txt = (s, x, y, px, col, w, weight, cond) => { c.save(); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = (weight || 'bold') + ' ' + px + 'px "Arial Narrow","Helvetica Neue",Arial,sans-serif'; c.translate(x, y); c.scale(cond || 0.82, 1); c.fillText(s, 0, 0, w ? w / (cond || 0.82) : undefined); c.restore(); };
    [['L', false], ['R', true]].forEach(([k, flip]) => {
      const reg = REG[k], P = sideP(reg, flip); c.save(); c.beginPath(); c.rect(reg.x, reg.y, reg.w, reg.h); c.clip();
      c.fillStyle = cream; c.fillRect(reg.x, reg.y, reg.w, reg.h);
      rect(P, -2.8, 2.34, 2.8, 2.54, red); // Dachlinie
      poly(P, [[1.10, 0.50], [1.10, 1.98], [2.04, 1.98], [2.22, 1.24], [2.26, 0.50]], 'rgba(70,60,44,0.75)', 2.2); // Fahrertür
      poly(P, [[-0.55, 0.62], [-0.55, 2.62], [1.00, 2.62], [1.00, 0.62]], 'rgba(70,60,44,0.55)', 1.6); // Schiebetür / Klappe Patientenraum
      rr2(c, ...P(1.34, 1.08).concat([0.14 * 180, 0.035 * 180, 4])); c.fillStyle = '#9a9a96'; c.fill(); c.strokeStyle = 'rgba(40,40,40,.7)'; c.lineWidth = 1.2; c.stroke(); // Türgriff
      rr2(c, ...P(-1.10, 2.0).concat([0.80 * 180, 0.50 * 180, 8])); c.fillStyle = '#8fa3ad'; c.fill(); c.strokeStyle = 'rgba(60,60,55,.8)'; c.lineWidth = 2; c.stroke(); // Milchglas-Fenster
      const pc = P(1.66, 0.88); shield(c, pc[0], pc[1], 0.20 * 180, 0.25 * 180, 'crest'); const tp = P(1.66, 0.60); txt('KREIS', tp[0], tp[1] - 5, 10, '#6b5f4a', 0, 'bold', 1); txt('PADERBORN', tp[0], tp[1] + 7, 10, '#6b5f4a', 0, 'bold', 1);
      const sh = P(-1.80, 1.0); shield(c, sh[0], sh[1], 0.22 * 180, 0.27 * 180, 'cross');
      rect(P, -2.72, 0.30, 2.64, 0.36, 'rgba(40,36,30,0.35)'); // Schweller
      dirt(reg); c.restore();
    });
    { // Front
      const reg = REG.F; c.save(); c.beginPath(); c.rect(reg.x, reg.y, reg.w, reg.h); c.clip(); c.fillStyle = cream; c.fillRect(reg.x, reg.y, reg.w, reg.h);
      rect(frontP, -1.05, 2.34, 1.05, 2.54, red); // Dachlinie über der Frontscheibe
      c.strokeStyle = 'rgba(70,60,44,.55)'; c.lineWidth = 2; const a = frontP(-1.0, 1.10), b = frontP(1.0, 1.10); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      const tp = frontP(0, 1.165); txt('RETTUNGSWAGEN', tp[0], tp[1], 66, '#1c1a18', 1.05 * 360, 'bold', 0.78);
      let q = frontP(-0.80, 1.17); shield(c, q[0], q[1], 0.14 * 360, 0.17 * 360, 'cross'); q = frontP(0.80, 1.17); shield(c, q[0], q[1], 0.14 * 360, 0.17 * 360, 'cross');
      dirt(reg); c.restore();
    }
    { // Heck
      const reg = REG.B; c.save(); c.beginPath(); c.rect(reg.x, reg.y, reg.w, reg.h); c.clip(); c.fillStyle = cream; c.fillRect(reg.x, reg.y, reg.w, reg.h);
      rect(backP, -1.05, 2.34, 1.05, 2.54, red);
      c.strokeStyle = 'rgba(70,60,44,.8)'; c.lineWidth = 2.4;
      [[-0.97, 0.0], [0.0, 0.97]].forEach(([x0, x1]) => { const p = backP(x0 + (x0 < 0 ? 0 : 0.01), 2.62), q2 = backP(x1 - (x1 > 0 ? 0 : 0.01), 0.62); rr2(c, Math.min(p[0], q2[0]), Math.min(p[1], q2[1]), Math.abs(q2[0] - p[0]), Math.abs(q2[1] - p[1]), 8); c.stroke(); });
      [[-0.80, -0.12], [0.12, 0.80]].forEach(([x0, x1]) => { const p = backP(x0, 2.28), q2 = backP(x1, 1.62); rr2(c, Math.min(p[0], q2[0]), Math.min(p[1], q2[1]), Math.abs(q2[0] - p[0]), Math.abs(q2[1] - p[1]), 14); c.fillStyle = '#8fa3ad'; c.fill(); c.stroke(); });
      [[-0.07, 1.25], [0.07, 1.25]].forEach(([x, y]) => { const p = backP(x, y); rr2(c, p[0] - 5, p[1] - 30, 10, 60, 4); c.fillStyle = '#a7a7a2'; c.fill(); });
      const sh = backP(0, 1.0); shield(c, sh[0], sh[1], 0.16 * 360, 0.2 * 360, 'cross'); dirt(reg); c.restore();
    }
    { // Dach
      const reg = REG.T; c.save(); c.beginPath(); c.rect(reg.x, reg.y, reg.w, reg.h); c.clip(); c.fillStyle = '#ddd0ae'; c.fillRect(reg.x, reg.y, reg.w, reg.h);
      const p = topP(0.38, -0.2), q = topP(-0.38, -1.0); rr2(c, Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]), 12); c.fillStyle = '#efe6cc'; c.fill(); c.strokeStyle = 'rgba(70,60,44,.6)'; c.lineWidth = 2; c.stroke(); // Dachlüfter
      const g = c.createLinearGradient(reg.x, 0, reg.x + reg.w, 0); g.addColorStop(0, 'rgba(110,100,80,.28)'); g.addColorStop(0.5, 'rgba(110,100,80,0)'); g.addColorStop(1, 'rgba(110,100,80,.28)'); c.fillStyle = g; c.fillRect(reg.x, reg.y, reg.w, reg.h); c.restore();
    }
    c.fillStyle = '#7d6f55'; c.fillRect(REG.D.x, REG.D.y, REG.D.w, REG.D.h);
    // Körnung / Verwitterung
    if (opt.noise !== false) { let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; for (let i = 0; i < 26000; i++) { const x = rnd() * AT, y = rnd() * AT, w = 1 + rnd() * 2; c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(60,48,30,0.035)'; c.fillRect(x, y, w, w); } }
    return cv;
  };
  function plateTexture() {
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 70; const c = cv.getContext('2d'); if (!c) return null;
    c.fillStyle = '#f3f1ea'; c.fillRect(0, 0, 320, 70); c.strokeStyle = '#111'; c.lineWidth = 5; c.strokeRect(3, 3, 314, 64);
    c.fillStyle = '#111'; c.font = 'bold 52px "Arial Narrow",Arial,sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText('PB', 72, 37); c.fillText('259', 224, 37);
    c.beginPath(); c.arc(138, 36, 11, 0, Math.PI * 2); c.fillStyle = '#b8352c'; c.fill(); c.fillStyle = '#111'; c.fillRect(120, 13, 36, 4); return cv;
  }

  /* ---- Alle Teile ---- */
  Q.parts = function (opt) {
    opt = opt || {}; const out = [], add = (name, geo, mat, extra) => out.push(Object.assign({ name, geo, mat }, extra || {}));
    const detail = opt.detail || 0.04;
    add('Karosserie', Q.bodyGeometry(detail), MAT('#ffffff', 0.55, 0, { map: 'atlas', vertexColors: true }));
    // Glas
    const wsw = 1.74, wsh = 0.74, wsMesh = () => { const g = glassFlat(wsw, wsh, 0.006); const cz = WS0[0] + WTz * (0.445) + WNz * -0.012, cy = WS0[1] + WTy * 0.445 + WNy * -0.012; return xf(g, { p: [0, cy, cz], r: [WANG / DEG, 0, 0] }); };
    add('Windschutzscheibe', wsMesh(), MAT('#26343a', 0.08, 0.2, { opacity: 0.38, glass: true }));
    add('Seitenscheibe links', sideGlass(1), MAT('#26343a', 0.08, 0.2, { opacity: 0.38, glass: true })); add('Seitenscheibe rechts', sideGlass(-1), MAT('#26343a', 0.08, 0.2, { opacity: 0.38, glass: true }));
    // Frontpartie
    const black = MAT('#1b1b1d', 0.55, 0.05), chrome = MAT('#c9ccd0', 0.18, 0.9), rubber = MAT('#17171a', 0.92, 0);
    const zf = ZF + 0.012;
    add('Kühlergrill', merge([xf(roundedBox(1.84, 0.26, 0.26, 0.03, 10), { p: [0, 0.845, zf - 0.065] }), xf(roundedBox(0.52, 0.19, 0.03, 0.012, 6), { p: [0, 0.845, zf + 0.06] }), ...[-0.72, -0.60, -0.46, -0.34, 0.34, 0.46, 0.60, 0.72].map(x => xf(roundedBox(0.09, 0.15, 0.02, 0.006, 3), { p: [x, 0.845, zf + 0.052] }))]), black);
    add('Frontemblem', xf(lathe([[0, 0], [0.05, 0], [0.06, 0.004], [0.06, 0.012], [0.0, 0.016]], 48).rotateX(Math.PI / 2), { p: [0, 0.855, zf + 0.085] }), chrome);
    [1, -1].forEach(sd => {
      const nm = sd > 0 ? 'links' : 'rechts', hx = 0.80 * sd, hy = 0.845, hz = zf + 0.075;
      add('Scheinwerferring ' + nm, xf(merge([lathe([[0.105, 0], [0.105, 0.018], [0.098, 0.026], [0.088, 0.024], [0.088, 0.008], [0.098, 0]].reverse(), 56).rotateX(Math.PI / 2), lathe([[0.088, 0.012], [0.07, 0.016], [0.040, 0.012], [0.0, 0.006]].reverse(), 56).rotateX(Math.PI / 2)]), { p: [hx, hy, hz - 0.008] }), chrome);
      add('Scheinwerferglas ' + nm, xf(lathe([[0, 0.034], [0.03, 0.033], [0.06, 0.029], [0.082, 0.022], [0.088, 0.014], [0.088, 0.004], [0.0, 0.004]], 56).rotateX(Math.PI / 2), { p: [hx, hy, hz - 0.012] }), MAT('#cfd8dc', 0.1, 0.3, { opacity: 0.55, glass: true }));
      add('Blinker ' + nm, xf(roundedBox(0.16, 0.085, 0.07, 0.018, 6), { p: [0.76 * sd, 1.015, ZF - 0.005] }), MAT('#e8761c', 0.35, 0.05, { emissive: '#5a2606' }));
      add('Standlicht ' + nm, xf(roundedBox(0.13, 0.08, 0.06, 0.015, 5), { p: [0.62 * sd, 0.60, ZF + 0.005] }), MAT('#d8dcd6', 0.25, 0.1, { opacity: 0.85, glass: true }));
    });
    add('Zusatzscheinwerfer', merge([-0.27, -0.09, 0.09, 0.27].map(x => merge([xf(lathe([[0.062, 0], [0.062, 0.05], [0.052, 0.058], [0.0, 0.062]].reverse(), 40).rotateX(Math.PI / 2), { p: [x, 0.585, ZF - 0.02] }), xf(lathe([[0.052, 0.058], [0.04, 0.062], [0.0, 0.064]], 40).rotateX(Math.PI / 2), { p: [x, 0.585, ZF - 0.02] })]))), MAT('#cfd0cc', 0.2, 0.6));
    add('Stoßstange vorn', xf(roundedBox(2.04, 0.20, 0.17, 0.06, 14), { p: [0, 0.385, ZF + 0.115] }), black);
    const pt = plateTexture(); add('Kennzeichen vorn', xf(new THREE.BoxGeometry(0.52, 0.11, 0.01), { p: [0, 0.405, ZF + 0.208] }), MAT('#ffffff', 0.5, 0, { map: 'plate' }), { plate: pt });
    // Heck
    add('Stoßstange hinten', xf(roundedBox(2.04, 0.20, 0.20, 0.06, 14), { p: [0, 0.38, ZR - 0.10] }), black);
    [1, -1].forEach(sd => { add('Rücklicht ' + (sd > 0 ? 'links' : 'rechts'), xf(roundedBox(0.14, 0.50, 0.05, 0.02, 6), { p: [0.93 * sd, 1.02, ZR - 0.012] }), MAT('#b31b1b', 0.35, 0.05, { emissive: '#3a0a0a' })); });
    // Spiegel, Wischer
    [1, -1].forEach(sd => {
      const nm = sd > 0 ? 'links' : 'rechts';
      add('Außenspiegel ' + nm, merge([xf(roundedBox(0.09, 0.26, 0.07, 0.03, 8), { p: [1.19 * sd, 1.52, 2.00] }), xf(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 10).rotateZ(Math.PI / 2), { p: [1.09 * sd, 1.28, 2.08] }), xf(new THREE.CylinderGeometry(0.012, 0.012, 0.30, 10), { p: [1.06 * sd, 1.40, 2.08], r: [0, 0, 18 * sd] })]), black);
      add('Scheibenwischer ' + nm, xf(merge([xf(roundedBox(0.56, 0.016, 0.012, 0.005, 2), { p: [0.30 * sd, 0.10, 0.018], r: [0, 0, 5 * sd] }), xf(roundedBox(0.012, 0.012, 0.012, 0.004, 2), { p: [0.60 * sd, 0.05, 0.016] }), xf(roundedBox(0.34, 0.010, 0.008, 0.003, 2), { p: [0.44 * sd, 0.075, 0.012], r: [0, 0, 11 * sd] })]), { p: [0, WS0[1] + WNy * 0.012, WS0[0] + WNz * 0.012], r: [WANG / DEG, 0, 0] }), rubber);
    });
    // Dach: Blaulicht, Antenne
    [1, -1].forEach(sd => {
      const bx = 0.62 * sd, bz = 1.55, by = TOP - 0.012, nm = sd > 0 ? 'links' : 'rechts';
      add('Blaulicht Sockel ' + nm, merge([xf(roundedBox(0.30, 0.06, 0.22, 0.02, 6), { p: [bx, by + 0.03, bz] }), xf(lathe([[0.11, 0], [0.11, 0.035], [0.095, 0.045], [0.0, 0.048]].reverse(), 40), { p: [bx, by + 0.045, bz] })]), MAT('#ece6d3', 0.5, 0.05));
      add('Blaulicht ' + nm, merge([xf(lathe([[0.095, 0], [0.10, 0.04], [0.09, 0.10], [0.065, 0.14], [0.035, 0.158], [0.0, 0.162]], 44), { p: [bx, by + 0.09, bz] }), xf(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 20), { p: [bx, by + 0.15, bz] })]), MAT('#1f4fd6', 0.15, 0.1, { opacity: 0.78, glass: true }));
    });
    add('Funkantenne', merge([xf(new THREE.CylinderGeometry(0.004, 0.006, 0.9, 8), { p: [-0.80, TOP + 0.45, 1.55] }), xf(new THREE.CylinderGeometry(0.03, 0.04, 0.04, 16), { p: [-0.80, TOP + 0.02, 1.55] })]), black);
    [[1, AXF, 'vorne links'], [-1, AXF, 'vorne rechts'], [1, AXR, 'hinten links'], [-1, AXR, 'hinten rechts']].forEach(([sd, za, nm]) => add('Radlaufblende ' + nm, xf(new THREE.TorusGeometry(0.47, 0.03, 10, 48, Math.PI + 0.3).rotateZ(-0.15).rotateY(Math.PI / 2), { p: [0.985 * sd, WY, za] }), MAT('#18181a', 0.85, 0)));
    // Fahrerhaus innen
    const dark = MAT('#2a2b2f', 0.75, 0), seatM = MAT('#3b4152', 0.9, 0);
    add('Armaturenbrett', merge([xf(roundedBox(1.74, 0.34, 0.46, 0.06, 8), { p: [0, 1.08, 2.14] }), xf(roundedBox(0.50, 0.14, 0.20, 0.04, 5), { p: [0.46, 1.31, 2.12] }), xf(roundedBox(0.30, 0.44, 0.34, 0.05, 5), { p: [0, 1.02, 1.96] })]), dark);
    add('Lenkrad', merge([xf(new THREE.TorusGeometry(0.19, 0.018, 14, 56), { p: [0.46, 1.25, 1.96], r: [-62, 0, 0] }), xf(new THREE.CylinderGeometry(0.03, 0.03, 0.30, 14), { p: [0.46, 1.14, 2.05], r: [-62, 0, 0] }), xf(roundedBox(0.34, 0.02, 0.02, 0.005, 2), { p: [0.46, 1.25, 1.96], r: [-62, 0, 0] })]), MAT('#1d1d20', 0.7, 0));
    [0.46, -0.46].forEach((sx, i) => add(i ? 'Sitz Beifahrer' : 'Sitz Fahrer', merge([xf(roundedBox(0.50, 0.13, 0.52, 0.04, 6), { p: [sx, 1.03, 1.50] }), xf(roundedBox(0.50, 0.58, 0.13, 0.05, 6), { p: [sx, 1.35, 1.25], r: [-10, 0, 0] }), xf(roundedBox(0.30, 0.16, 0.10, 0.04, 5), { p: [sx, 1.76, 1.20], r: [-10, 0, 0] }), xf(roundedBox(0.30, 0.16, 0.32, 0.03, 4), { p: [sx, 0.95, 1.50] })]), seatM));
    // Räder
    const tire = Q.tireGeometry(), rim = Q.rimGeometry();
    [[1, AXF, 'vorne links'], [-1, AXF, 'vorne rechts'], [1, AXR, 'hinten links'], [-1, AXR, 'hinten rechts']].forEach(([sd, za, nm]) => {
      const rot = sd > 0 ? 0 : 180;
      add('Reifen ' + nm, xf(tire.clone(), { r: [0, rot, 0] }), rubber, { position: [WX * sd, WY, za] });
      add('Felge ' + nm, xf(rim.clone(), { r: [0, rot, 0] }), MAT('#d8d5c8', 0.45, 0.45), { position: [WX * sd, WY, za] });
    });
    return out;
  };

  /* ---- In die Szene setzen ---- */
  Q.build = function (opt) {
    opt = opt || {}; const parts = Q.parts(opt), tex = Q.texture(opt); let atlas = null, plate = null;
    if (tex) { atlas = new THREE.CanvasTexture(tex); atlas.encoding = THREE.sRGBEncoding; atlas.anisotropy = 8; atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter; }
    const list = [];
    parts.forEach(p => {
      const m = V.makeMaterial(new THREE.Color(p.mat.color)); m.roughness = p.mat.rough; m.metalness = p.mat.metal;
      if (p.mat.map === 'atlas' && atlas) { m.map = atlas; m.color.set('#ffffff'); }
      if (p.mat.map === 'plate' && p.plate) { const t = new THREE.CanvasTexture(p.plate); t.encoding = THREE.sRGBEncoding; m.map = t; }
      if (p.mat.vertexColors) m.vertexColors = true;
      if (p.mat.opacity !== undefined) m.userData.opacity = p.mat.opacity;
      if (p.name !== 'Karosserie') m.side = THREE.DoubleSide;
      const g = p.geo; if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      const o = V.addMesh(g, { name: 'RTW ' + p.name, kind: 'mesh', material: m, position: p.position || [0, 0, 0], dropToGrid: false, silent: true });
      list.push(o);
    });
    return list;
  };

  Q.add = function (opt) {
    const list = Q.build(opt); H.push('Beispiel: Rettungswagen', () => list.forEach(o => V._detach(o)), () => list.forEach(o => V._attach(o)));
    V.select(list[0]); V.refreshAll(); V.frame(); const t = list.reduce((s, o) => s + F.geo.stats(o.geometry).tris, 0); return { list, tris: t };
  };
  return Q;
})();

F.demoAmbulance = function (detail) {
  UI.clearScene(); let r;
  F.group('Rettungswagen', () => { r = F.vehicle.add({ detail: detail || 0.04 }); });
  V.viewDir('iso'); V.frame(); F.say('Rettungswagen (VW LT, Hochdach) nach deinem Foto: ' + r.list.length + ' Objekte, ' + r.tris.toLocaleString('de-DE') + ' Dreiecke'); return r;
};
