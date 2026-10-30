/* ============================================================
   Mesh-Operationen auf Flächen: Extrudieren, Einsetzen, Fase, Löschen,
   Abtrennen, Verschmelzen, Kantenschleife, Verschieben/Skalieren mit
   weichem Abfall, Auswahl per Regel (für Oberfläche und KI-Befehle)
   Alle Funktionen arbeiten auf einer Dreiecksliste (nicht indiziert) und
   liefern neue Geometrie mit nach Winkel geglätteten Normalen zurück.
   ============================================================ */
F.meshops = (function () {
  const M = {}, Q = 1e5;
  const key = (x, y, z) => Math.round(x * Q) + ',' + Math.round(y * Q) + ',' + Math.round(z * Q);
  M.key = key;

  /* ---------- Aufbereitung ---------- */
  M.topo = function (geo) {
    const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
    const cnt = idx ? idx.count : pos.count, n = Math.floor(cnt / 3);
    const P = new Float32Array(n * 9), U = new Float32Array(n * 6), cg = new Int32Array(n * 3), map = new Map(), gp = [], keys = [];
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const c = t * 3 + k, v = idx ? idx.getX(c) : c, x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      P[c * 3] = x; P[c * 3 + 1] = y; P[c * 3 + 2] = z;
      if (uv) { U[c * 2] = uv.getX(v); U[c * 2 + 1] = uv.getY(v); }
      const kk = key(x, y, z); let g = map.get(kk);
      if (g === undefined) { g = keys.length; map.set(kk, g); keys.push(kk); gp.push(x, y, z); }
      cg[c] = g;
    }
    return { n, P, U, cg, ng: keys.length, gp: Float32Array.from(gp), keys, map };
  };
  /* Flächennormalen (Länge = doppelte Fläche) */
  function faceN(P, n) {
    const N = new Float32Array(n * 3);
    for (let t = 0; t < n; t++) {
      const o = t * 9, ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2], bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
      N[t * 3] = ay * bz - az * by; N[t * 3 + 1] = az * bx - ax * bz; N[t * 3 + 2] = ax * by - ay * bx;
    }
    return N;
  }
  const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
  /* Geometrie aus Dreiecksliste: Nulldreiecke entfernen, Normalen nach Winkel glätten */
  function build(P, U, n, ang) {
    const N0 = faceN(P, n), keep = [];
    for (let t = 0; t < n; t++) if (len3(N0[t * 3], N0[t * 3 + 1], N0[t * 3 + 2]) > 1e-10) keep.push(t);
    const m = keep.length, Pp = new Float32Array(m * 9), Uu = new Float32Array(m * 6), N = new Float32Array(m * 3);
    keep.forEach((t, i) => { Pp.set(P.subarray(t * 9, t * 9 + 9), i * 9); Uu.set(U.subarray(t * 6, t * 6 + 6), i * 6); N.set(N0.subarray(t * 3, t * 3 + 3), i * 3); });
    const un = new Float32Array(m * 3);
    for (let t = 0; t < m; t++) { const l = len3(N[t * 3], N[t * 3 + 1], N[t * 3 + 2]) || 1; un[t * 3] = N[t * 3] / l; un[t * 3 + 1] = N[t * 3 + 1] / l; un[t * 3 + 2] = N[t * 3 + 2] / l; }
    const cosA = Math.cos((ang === undefined ? 40 : ang) * Math.PI / 180), map = new Map(), lists = [], cg = new Int32Array(m * 3);
    for (let c = 0; c < m * 3; c++) {
      const kk = key(Pp[c * 3], Pp[c * 3 + 1], Pp[c * 3 + 2]); let g = map.get(kk);
      if (g === undefined) { g = lists.length; map.set(kk, g); lists.push([]); }
      lists[g].push((c / 3) | 0); cg[c] = g;
    }
    const NN = new Float32Array(m * 9);
    for (let c = 0; c < m * 3; c++) {
      const t = (c / 3) | 0, L = lists[cg[c]]; let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < L.length; i++) {
        const t2 = L[i], d = un[t * 3] * un[t2 * 3] + un[t * 3 + 1] * un[t2 * 3 + 1] + un[t * 3 + 2] * un[t2 * 3 + 2];
        if (d >= cosA) { sx += N[t2 * 3]; sy += N[t2 * 3 + 1]; sz += N[t2 * 3 + 2]; }
      }
      const l = len3(sx, sy, sz);
      if (l < 1e-12) { NN[c * 3] = un[t * 3]; NN[c * 3 + 1] = un[t * 3 + 1]; NN[c * 3 + 2] = un[t * 3 + 2]; } else { NN[c * 3] = sx / l; NN[c * 3 + 1] = sy / l; NN[c * 3 + 2] = sz / l; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(NN, 3)); g.setAttribute('uv', new THREE.BufferAttribute(Uu, 2));
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
  M.build = build;
  const join = (a, b) => { const r = new Float32Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };
  const cnt = mask => { let c = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) c++; return c; };
  M.count = cnt;

  /* ---------- Auswahl ---------- */
  M.facesFromKeys = function (T, keySet, any) {
    const mask = new Uint8Array(T.n);
    for (let t = 0; t < T.n; t++) {
      let hit = 0; for (let k = 0; k < 3; k++) if (keySet.has(T.keys[T.cg[t * 3 + k]])) hit++;
      if (any ? hit > 0 : hit === 3) mask[t] = 1;
    }
    return mask;
  };
  /* Auswahlregel (lokale Koordinaten): 'all' | { normal:[x,y,z], tol:Grad, box:[[min],[max]], axis:'y', min, max, rel:true }
     Mehrere Angaben gelten zugleich. Die Fläche zählt, wenn ihr Mittelpunkt im Bereich liegt. */
  M.select = function (T, spec) {
    const mask = new Uint8Array(T.n);
    if (spec === undefined || spec === null || spec === 'all' || spec === true) { mask.fill(1); return mask; }
    const N = faceN(T.P, T.n), P = T.P;
    let nx = 0, ny = 0, nz = 0, cosT = -2;
    if (spec.normal) { const l = len3(spec.normal[0], spec.normal[1], spec.normal[2]) || 1; nx = spec.normal[0] / l; ny = spec.normal[1] / l; nz = spec.normal[2] / l; cosT = Math.cos((spec.tol === undefined ? 20 : +spec.tol) * Math.PI / 180); }
    let bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < T.ng; i++) for (let a = 0; a < 3; a++) { const v = T.gp[i * 3 + a]; if (v < bmin[a]) bmin[a] = v; if (v > bmax[a]) bmax[a] = v; }
    const ax = spec.axis === undefined ? -1 : { x: 0, y: 1, z: 2 }[String(spec.axis).toLowerCase()];
    if (ax === undefined) throw new Error('Achse x, y oder z');
    let lo = spec.min, hi = spec.max;
    if (ax >= 0 && spec.rel) { const r = bmax[ax] - bmin[ax]; lo = lo === undefined ? undefined : bmin[ax] + lo * r; hi = hi === undefined ? undefined : bmin[ax] + hi * r; }
    let box = spec.box ? spec.box.map(v => v.slice()) : null;
    if (box && spec.rel) for (let a = 0; a < 3; a++) { const r = bmax[a] - bmin[a]; box[0][a] = bmin[a] + box[0][a] * r; box[1][a] = bmin[a] + box[1][a] * r; }
    const E = 1e-6;
    for (let t = 0; t < T.n; t++) {
      if (cosT > -2) { const l = len3(N[t * 3], N[t * 3 + 1], N[t * 3 + 2]); if (l < 1e-12) continue; if ((N[t * 3] * nx + N[t * 3 + 1] * ny + N[t * 3 + 2] * nz) / l < cosT) continue; }
      const o = t * 9, cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cy = (P[o + 1] + P[o + 4] + P[o + 7]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
      if (ax >= 0) { const c = [cx, cy, cz][ax]; if (lo !== undefined && c < lo - E) continue; if (hi !== undefined && c > hi + E) continue; }
      if (box && (cx < box[0][0] - E || cx > box[1][0] + E || cy < box[0][1] - E || cy > box[1][1] + E || cz < box[0][2] - E || cz > box[1][2] + E)) continue;
      mask[t] = 1;
    }
    return mask;
  };

  /* ---------- Randkanten und Gruppennormalen ---------- */
  function boundary(T, mask) {
    const c = new Map(), out = [], ng = T.ng;
    const ek = (a, b) => a < b ? a * ng + b : b * ng + a;
    for (let t = 0; t < T.n; t++) if (mask[t]) for (let k = 0; k < 3; k++) { const e = ek(T.cg[t * 3 + k], T.cg[t * 3 + (k + 1) % 3]); c.set(e, (c.get(e) || 0) + 1); }
    for (let t = 0; t < T.n; t++) if (mask[t]) for (let k = 0; k < 3; k++) {
      const a = T.cg[t * 3 + k], b = T.cg[t * 3 + (k + 1) % 3];
      if (c.get(ek(a, b)) === 1) out.push({ t, k, a, b });
    }
    return out;
  }
  function groupNormals(T, mask, N) {
    const gn = new Float64Array(T.ng * 3), has = new Uint8Array(T.ng);
    for (let t = 0; t < T.n; t++) if (mask[t]) for (let k = 0; k < 3; k++) { const g = T.cg[t * 3 + k]; gn[g * 3] += N[t * 3]; gn[g * 3 + 1] += N[t * 3 + 1]; gn[g * 3 + 2] += N[t * 3 + 2]; has[g] = 1; }
    for (let g = 0; g < T.ng; g++) { const l = len3(gn[g * 3], gn[g * 3 + 1], gn[g * 3 + 2]); if (l > 1e-12) { gn[g * 3] /= l; gn[g * 3 + 1] /= l; gn[g * 3 + 2] /= l; } }
    return { gn, has };
  }
  const needFaces = mask => { if (!cnt(mask)) throw new Error('Keine Fläche ausgewählt – mindestens alle drei Punkte eines Dreiecks wählen'); };
  /* Seitenwand zwischen alter Kante (pa,pb) und neuer Kante (qa,qb); flip kehrt die Richtung um */
  function wall(W, WU, pa, pb, qa, qb, ua, ub, flip) {
    const tri = (p, q, r, uu, vv, ww) => { W.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); WU.push(uu[0], uu[1], vv[0], vv[1], ww[0], ww[1]); };
    if (!flip) { tri(pa, pb, qb, ua, ub, ub); tri(pa, qb, qa, ua, ub, ua); } else { tri(pa, qb, pb, ua, ub, ub); tri(pa, qa, qb, ua, ua, ub); }
  }
  const pt = (A, c) => [A[c * 3], A[c * 3 + 1], A[c * 3 + 2]], uvOf = (U, c) => [U[c * 2], U[c * 2 + 1]];
  function keysOfCorners(T, mask, P2) {
    const s = new Set();
    for (let t = 0; t < T.n; t++) if (mask[t]) for (let k = 0; k < 3; k++) { const c = t * 3 + k; s.add(key(P2[c * 3], P2[c * 3 + 1], P2[c * 3 + 2])); }
    return s;
  }

  /* ---------- Operationen ---------- */
  /* Fläche(n) entlang der gemittelten Normalen herausziehen (negativ = eindrücken) */
  M.extrude = function (T, mask, dist) {
    needFaces(mask); dist = +dist || 0;
    const N = faceN(T.P, T.n), { gn } = groupNormals(T, mask, N), bd = boundary(T, mask), P2 = Float32Array.from(T.P);
    for (let t = 0; t < T.n; t++) if (mask[t]) for (let k = 0; k < 3; k++) { const c = t * 3 + k, g = T.cg[c]; P2[c * 3] += gn[g * 3] * dist; P2[c * 3 + 1] += gn[g * 3 + 1] * dist; P2[c * 3 + 2] += gn[g * 3 + 2] * dist; }
    const W = [], WU = [];
    bd.forEach(e => { const ca = e.t * 3 + e.k, cb = e.t * 3 + (e.k + 1) % 3; wall(W, WU, pt(T.P, ca), pt(T.P, cb), pt(P2, ca), pt(P2, cb), uvOf(T.U, ca), uvOf(T.U, cb), false); });
    const geo = build(join(P2, Float32Array.from(W)), join(T.U, Float32Array.from(WU)), T.n + W.length / 9);
    return { geo, keys: keysOfCorners(T, mask, P2), info: bd.length + ' Randkanten' };
  };
  /* Fläche(n) nach innen verkleinern; mit drop > 0 wird der äußere Rand zusätzlich abgesenkt (Fase) */
  M.inset = function (T, mask, amount, drop) {
    needFaces(mask); amount = Math.abs(+amount || 0); drop = +drop || 0;
    const N = faceN(T.P, T.n), { gn } = groupNormals(T, mask, N), bd = boundary(T, mask);
    if (!bd.length) throw new Error('Die Auswahl hat keinen Rand (ganzes Objekt gewählt?)');
    const acc = new Float64Array(T.ng * 3), l1 = new Float64Array(T.ng * 3), has = new Uint8Array(T.ng);
    bd.forEach(e => {
      const ca = e.t * 3 + e.k, cb = e.t * 3 + (e.k + 1) % 3, ex = T.P[cb * 3] - T.P[ca * 3], ey = T.P[cb * 3 + 1] - T.P[ca * 3 + 1], ez = T.P[cb * 3 + 2] - T.P[ca * 3 + 2];
      let fx = N[e.t * 3], fy = N[e.t * 3 + 1], fz = N[e.t * 3 + 2]; const fl = len3(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      let wx = fy * ez - fz * ey, wy = fz * ex - fx * ez, wz = fx * ey - fy * ex; const wl = len3(wx, wy, wz) || 1; wx /= wl; wy /= wl; wz /= wl;
      [e.a, e.b].forEach(g => { acc[g * 3] += wx; acc[g * 3 + 1] += wy; acc[g * 3 + 2] += wz; if (!has[g]) { has[g] = 1; l1[g * 3] = wx; l1[g * 3 + 1] = wy; l1[g * 3 + 2] = wz; } });
    });
    const vec = new Float64Array(T.ng * 3);
    for (let g = 0; g < T.ng; g++) if (has[g]) {
      const l = len3(acc[g * 3], acc[g * 3 + 1], acc[g * 3 + 2]); if (l < 1e-12) continue;
      const vx = acc[g * 3] / l, vy = acc[g * 3 + 1] / l, vz = acc[g * 3 + 2] / l, s = amount / Math.max(0.35, vx * l1[g * 3] + vy * l1[g * 3 + 1] + vz * l1[g * 3 + 2]);
      vec[g * 3] = vx * s; vec[g * 3 + 1] = vy * s; vec[g * 3 + 2] = vz * s;
    }
    const P2 = Float32Array.from(T.P), P0 = Float32Array.from(T.P);
    for (let t = 0; t < T.n; t++) for (let k = 0; k < 3; k++) {
      const c = t * 3 + k, g = T.cg[c];
      if (mask[t]) { if (has[g]) { P2[c * 3] += vec[g * 3]; P2[c * 3 + 1] += vec[g * 3 + 1]; P2[c * 3 + 2] += vec[g * 3 + 2]; } }
      else if (drop && has[g]) { P0[c * 3] -= gn[g * 3] * drop; P0[c * 3 + 1] -= gn[g * 3 + 1] * drop; P0[c * 3 + 2] -= gn[g * 3 + 2] * drop; }
    }
    const down = (c) => { const g = T.cg[c], p = pt(T.P, c); return drop ? [p[0] - gn[g * 3] * drop, p[1] - gn[g * 3 + 1] * drop, p[2] - gn[g * 3 + 2] * drop] : p; };
    const W = [], WU = [];
    bd.forEach(e => { const ca = e.t * 3 + e.k, cb = e.t * 3 + (e.k + 1) % 3; wall(W, WU, down(ca), down(cb), pt(P2, ca), pt(P2, cb), uvOf(T.U, ca), uvOf(T.U, cb), false); });
    // Rand der Auswahl in P0 gleich mit absenken (Randdreiecke außerhalb)
    const base = drop ? P0 : T.P;
    const geo = build(join(joinMasked(base, P2, mask, T.n), Float32Array.from(W)), join(T.U, Float32Array.from(WU)), T.n + W.length / 9);
    return { geo, keys: keysOfCorners(T, mask, P2), info: bd.length + ' Randkanten' };
  };
  function joinMasked(base, P2, mask, n) { const r = Float32Array.from(base); for (let t = 0; t < n; t++) if (mask[t]) r.set(P2.subarray(t * 9, t * 9 + 9), t * 9); return r; }
  M.fase = (T, mask, amount) => M.inset(T, mask, amount, amount);

  function pick(T, mask, want) {
    const idx = []; for (let t = 0; t < T.n; t++) if ((mask[t] ? 1 : 0) === want) idx.push(t);
    const P = new Float32Array(idx.length * 9), U = new Float32Array(idx.length * 6);
    idx.forEach((t, i) => { P.set(T.P.subarray(t * 9, t * 9 + 9), i * 9); U.set(T.U.subarray(t * 6, t * 6 + 6), i * 6); });
    return { P, U, n: idx.length };
  }
  M.remove = function (T, mask) {
    if (!cnt(mask)) throw new Error('Nichts ausgewählt');
    const r = pick(T, mask, 0); if (!r.n) throw new Error('Das würde das ganze Objekt löschen');
    return { geo: build(r.P, r.U, r.n), keys: new Set(), info: cnt(mask) + ' Dreiecke entfernt' };
  };
  M.separate = function (T, mask) {
    if (!cnt(mask)) throw new Error('Nichts ausgewählt');
    const a = pick(T, mask, 0), b = pick(T, mask, 1); if (!a.n) throw new Error('Das würde das ganze Objekt abtrennen');
    return { geo: build(a.P, a.U, a.n), part: build(b.P, b.U, b.n), keys: new Set(), info: b.n + ' Dreiecke abgetrennt' };
  };
  M.copy = function (T, mask) {
    if (!cnt(mask)) throw new Error('Nichts ausgewählt');
    const b = pick(T, mask, 1); return { part: build(b.P, b.U, b.n), info: b.n + ' Dreiecke kopiert' };
  };
  /* Punkte (Schlüsselmenge der Auswahl) zusammenführen: center = alle in die Mitte, sonst Raster der Größe thr */
  M.merge = function (T, keySet, thr) {
    const sel = new Uint8Array(T.ng); let ns = 0; keySet.forEach(k => { const g = T.map.get(k); if (g !== undefined) { sel[g] = 1; ns++; } });
    if (!ns) throw new Error('Keine Punkte ausgewählt');
    thr = +thr || 0; const cl = new Map(), of = new Int32Array(T.ng).fill(-1), cs = [];
    for (let g = 0; g < T.ng; g++) if (sel[g]) {
      const x = T.gp[g * 3], y = T.gp[g * 3 + 1], z = T.gp[g * 3 + 2], ck = thr > 0 ? Math.floor(x / thr) + ',' + Math.floor(y / thr) + ',' + Math.floor(z / thr) : 'c';
      let i = cl.get(ck); if (i === undefined) { i = cs.length; cl.set(ck, i); cs.push({ s: [0, 0, 0], n: 0 }); }
      cs[i].s[0] += x; cs[i].s[1] += y; cs[i].s[2] += z; cs[i].n++; of[g] = i;
    }
    const P2 = Float32Array.from(T.P), keys = new Set();
    for (let c = 0; c < T.n * 3; c++) { const g = T.cg[c]; if (of[g] >= 0) { const q = cs[of[g]]; P2[c * 3] = q.s[0] / q.n; P2[c * 3 + 1] = q.s[1] / q.n; P2[c * 3 + 2] = q.s[2] / q.n; } }
    cs.forEach(q => keys.add(key(q.s[0] / q.n, q.s[1] / q.n, q.s[2] / q.n)));
    const before = T.n, geo = build(P2, T.U, T.n);
    return { geo, keys, info: ns + ' Punkte zu ' + cs.length + ' verschmolzen, ' + (before - Math.floor(geo.attributes.position.count / 3)) + ' Dreiecke entfallen' };
  };
  /* Kantenschleife: alle Dreiecke an Ebenen senkrecht zur Achse auftrennen. ats = Positionen oder { count, rel } */
  M.loopcut = function (T, axis, ats) {
    const ax = { x: 0, y: 1, z: 2 }[String(axis).toLowerCase()]; if (ax === undefined) throw new Error('Achse x, y oder z');
    let lo = Infinity, hi = -Infinity; for (let g = 0; g < T.ng; g++) { const v = T.gp[g * 3 + ax]; if (v < lo) lo = v; if (v > hi) hi = v; }
    let list;
    if (Array.isArray(ats)) list = ats.map(Number);
    else if (ats && ats.count) { list = []; const c = Math.max(1, Math.min(64, ats.count | 0)); for (let i = 1; i <= c; i++) list.push(lo + (hi - lo) * i / (c + 1)); }
    else if (ats && ats.at !== undefined) list = [ats.rel ? lo + (hi - lo) * ats.at : +ats.at];
    else list = [(lo + hi) / 2];
    let P = T.P, U = T.U, n = T.n; const eps = 1e-7;
    list.forEach(at => {
      const oP = [], oU = [];
      const emit = (poly) => { for (let i = 1; i + 1 < poly.length; i++) { [poly[0], poly[i], poly[i + 1]].forEach(v => { oP.push(v.p[0], v.p[1], v.p[2]); oU.push(v.u[0], v.u[1]); }); } };
      for (let t = 0; t < n; t++) {
        const V3 = [0, 1, 2].map(k => ({ p: [P[(t * 3 + k) * 3], P[(t * 3 + k) * 3 + 1], P[(t * 3 + k) * 3 + 2]], u: [U[(t * 3 + k) * 2], U[(t * 3 + k) * 2 + 1]] }));
        const d = V3.map(v => v.p[ax] - at), s = d.map(x => x > eps ? 1 : x < -eps ? -1 : 0);
        if (!(Math.max(...s) > 0 && Math.min(...s) < 0)) { emit(V3); continue; }
        const L = [], R = [];
        for (let i = 0; i < 3; i++) {
          const j = (i + 1) % 3, a = V3[i], b = V3[j];
          if (s[i] <= 0) L.push(a); if (s[i] >= 0) R.push(a);
          if (s[i] * s[j] < 0) {
            const p = a.p[ax] <= b.p[ax] ? a : b, q = p === a ? b : a, tt = (at - p.p[ax]) / (q.p[ax] - p.p[ax]);
            const I = { p: [p.p[0] + (q.p[0] - p.p[0]) * tt, p.p[1] + (q.p[1] - p.p[1]) * tt, p.p[2] + (q.p[2] - p.p[2]) * tt], u: [p.u[0] + (q.u[0] - p.u[0]) * tt, p.u[1] + (q.u[1] - p.u[1]) * tt] };
            I.p[ax] = at; L.push(I); R.push(I);
          }
        }
        emit(L); emit(R);
      }
      P = Float32Array.from(oP); U = Float32Array.from(oU); n = oP.length / 9;
    });
    return { geo: build(P, U, n), keys: new Set(), info: list.length + ' Schnitt' + (list.length === 1 ? '' : 'e') + ', ' + n + ' Dreiecke' };
  };
  /* Punkte der Auswahl verschieben / skalieren (um ihren Mittelpunkt) / drehen, optional mit weichem Abfall (soft = Radius) */
  M.transform = function (T, mask, o) {
    needFaces(mask); o = o || {};
    const sel = new Uint8Array(T.ng); const c = [0, 0, 0]; let ns = 0;
    for (let t = 0; t < T.n; t++) if (mask[t]) for (let k = 0; k < 3; k++) { const g = T.cg[t * 3 + k]; if (!sel[g]) { sel[g] = 1; ns++; c[0] += T.gp[g * 3]; c[1] += T.gp[g * 3 + 1]; c[2] += T.gp[g * 3 + 2]; } }
    c[0] /= ns; c[1] /= ns; c[2] /= ns;
    const mv = o.move || [0, 0, 0], sc = o.scale === undefined ? [1, 1, 1] : (Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]), rot = (o.rotate || [0, 0, 0]).map(x => x * Math.PI / 180);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    const sp = []; for (let g = 0; g < T.ng; g++) if (sel[g]) sp.push(T.gp[g * 3], T.gp[g * 3 + 1], T.gp[g * 3 + 2]);
    const R = +o.soft || 0, w = new Float32Array(T.ng), nsel = sp.length / 3, stride = nsel * T.ng > 4e6 ? Math.ceil(nsel * T.ng / 4e6) : 1;
    for (let g = 0; g < T.ng; g++) {
      if (sel[g]) { w[g] = 1; continue; } if (!R) continue;
      let d2 = Infinity; for (let s = 0; s < nsel; s += stride) { const dx = sp[s * 3] - T.gp[g * 3], dy = sp[s * 3 + 1] - T.gp[g * 3 + 1], dz = sp[s * 3 + 2] - T.gp[g * 3 + 2], d = dx * dx + dy * dy + dz * dz; if (d < d2) d2 = d; }
      const tt = Math.sqrt(d2) / R; if (tt < 1) w[g] = (1 - tt * tt) * (1 - tt * tt);
    }
    const np = new Float32Array(T.ng * 3), v = new THREE.Vector3();
    for (let g = 0; g < T.ng; g++) {
      const x = T.gp[g * 3], y = T.gp[g * 3 + 1], z = T.gp[g * 3 + 2];
      if (!w[g]) { np[g * 3] = x; np[g * 3 + 1] = y; np[g * 3 + 2] = z; continue; }
      v.set((x - c[0]) * sc[0], (y - c[1]) * sc[1], (z - c[2]) * sc[2]).applyQuaternion(q); v.x += c[0] + mv[0]; v.y += c[1] + mv[1]; v.z += c[2] + mv[2];
      np[g * 3] = x + (v.x - x) * w[g]; np[g * 3 + 1] = y + (v.y - y) * w[g]; np[g * 3 + 2] = z + (v.z - z) * w[g];
    }
    const P2 = new Float32Array(T.P.length), keys = new Set();
    for (let k = 0; k < T.n * 3; k++) { const g = T.cg[k]; P2[k * 3] = np[g * 3]; P2[k * 3 + 1] = np[g * 3 + 1]; P2[k * 3 + 2] = np[g * 3 + 2]; if (sel[g]) keys.add(key(np[g * 3], np[g * 3 + 1], np[g * 3 + 2])); }
    return { geo: build(P2, T.U, T.n, 180), keys, info: ns + ' Punkte bewegt' };
  };

  /* Alles in einem: Objekt-Netz + Befehlsobjekt → Ergebnis. sel: Auswahlregel, op: Name */
  M.run = function (geo, c) {
    const T = M.topo(geo), mask = c.keys ? M.facesFromKeys(T, c.keys, c.any) : M.select(T, c.select);
    const op = String(c.op || '').toLowerCase();
    if (op === 'extrude' || op === 'extrudieren') return M.extrude(T, mask, c.amount === undefined ? 0.2 : c.amount);
    if (op === 'inset' || op === 'einsetzen') return M.inset(T, mask, c.amount === undefined ? 0.1 : c.amount, 0);
    if (op === 'fase' || op === 'bevel') return M.fase(T, mask, c.amount === undefined ? 0.05 : c.amount);
    if (op === 'delete' || op === 'löschen' || op === 'loeschen') return M.remove(T, mask);
    if (op === 'separate' || op === 'abtrennen') return M.separate(T, mask);
    if (op === 'copy' || op === 'duplicate' || op === 'kopieren') return M.copy(T, mask);
    if (op === 'move' || op === 'scale' || op === 'rotate' || op === 'transform') return M.transform(T, mask, { move: c.move || (op === 'move' ? c.by : null), scale: c.scale, rotate: c.rotate, soft: c.soft });
    if (op === 'merge' || op === 'verschmelzen') {
      const ks = new Set(); for (let t = 0; t < T.n; t++) if (mask[t]) for (let k = 0; k < 3; k++) ks.add(T.keys[T.cg[t * 3 + k]]);
      return M.merge(T, c.keys || ks, c.mode === 'center' ? 0 : (c.distance || 0));
    }
    if (op === 'loopcut' || op === 'schleife') return M.loopcut(T, c.axis || 'y', c.at !== undefined ? { at: c.at, rel: c.rel } : { count: c.count || 1 });
    throw new Error('Unbekannte Mesh-Operation: ' + c.op + ' (extrude, inset, fase, delete, separate, copy, move, scale, rotate, merge, loopcut)');
  };
  return M;
})();
