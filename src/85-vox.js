/* ============================================================
   Voxel-Werkzeuge: Feld abtasten, Surface Nets (Iso-Fläche), Dichtefelder
   aus Punkten, Glätten (Taubin), Farben übertragen. Gemeinsame Basis für
   Fotomodus, Punktwolken/Splats → Netz und das Referenzmodell.
   Konvention: Feldwert < Level = innen.
   ============================================================ */
F.vox = (function () {
  const X = {};
  const tick = () => new Promise(r => setTimeout(r, 0));
  X.tick = tick;

  X.grid = function (min, max, h, pad) {
    pad = pad === undefined ? 2 : pad;
    const ox = min[0] - pad * h, oy = min[1] - pad * h, oz = min[2] - pad * h;
    const nx = Math.ceil((max[0] - min[0]) / h) + 2 * pad + 1, ny = Math.ceil((max[1] - min[1]) / h) + 2 * pad + 1, nz = Math.ceil((max[2] - min[2]) / h) + 2 * pad + 1;
    if (nx * ny * nz > 60e6) throw new Error('Voxelraster zu groß (' + nx + '×' + ny + '×' + nz + ') – gröbere Auflösung wählen');
    return { nx, ny, nz, h, ox, oy, oz, d: new Float32Array(nx * ny * nz) };
  };

  /* Feld fn(x,y,z) an allen Knoten abtasten. Mit skip: Blöcke weit weg von der Fläche werden übersprungen. */
  X.fromField = function (fn, min, max, h, opt) {
    opt = opt || {}; const g = X.grid(min, max, h, opt.pad), { nx, ny, nz, d } = g, B = 4, skip = opt.skip !== false, lim = B * h * 0.9;
    for (let k0 = 0; k0 < nz; k0 += B) for (let j0 = 0; j0 < ny; j0 += B) for (let i0 = 0; i0 < nx; i0 += B) {
      const i1 = Math.min(nx, i0 + B), j1 = Math.min(ny, j0 + B), k1 = Math.min(nz, k0 + B);
      if (skip) {
        const cx = g.ox + (i0 + i1 - 1) * 0.5 * h, cy = g.oy + (j0 + j1 - 1) * 0.5 * h, cz = g.oz + (k0 + k1 - 1) * 0.5 * h, v = fn(cx, cy, cz);
        if (Math.abs(v) > lim) { for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) { let p = i0 + nx * (j + ny * k); for (let i = i0; i < i1; i++) d[p++] = v; } continue; }
      }
      for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) { let p = i0 + nx * (j + ny * k); for (let i = i0; i < i1; i++) d[p++] = fn(g.ox + i * h, g.oy + j * h, g.oz + k * h); }
    }
    return g;
  };

  /* Gradient (zentrale Differenzen) am Knoten */
  function nodeGrad(g, i, j, k, out) {
    const { nx, ny, nz, d } = g, sy = nx, sz = nx * ny, p = i + nx * (j + ny * k);
    const i0 = i > 0 ? p - 1 : p, i1 = i < nx - 1 ? p + 1 : p, j0 = j > 0 ? p - sy : p, j1 = j < ny - 1 ? p + sy : p, k0 = k > 0 ? p - sz : p, k1 = k < nz - 1 ? p + sz : p;
    out[0] = d[i1] - d[i0]; out[1] = d[j1] - d[j0]; out[2] = d[k1] - d[k0];
  }
  /* Normale an Weltposition (trilinear aus Knotengradienten) */
  X.normalAt = function (g, x, y, z, out) {
    const fx = (x - g.ox) / g.h, fy = (y - g.oy) / g.h, fz = (z - g.oz) / g.h;
    let i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz); i = clamp(i, 0, g.nx - 2); j = clamp(j, 0, g.ny - 2); k = clamp(k, 0, g.nz - 2);
    const tx = clamp(fx - i, 0, 1), ty = clamp(fy - j, 0, 1), tz = clamp(fz - k, 0, 1), gr = [0, 0, 0]; let a = 0, b = 0, c = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz); nodeGrad(g, i + dx, j + dy, k + dz, gr); a += w * gr[0]; b += w * gr[1]; c += w * gr[2];
    }
    const l = Math.sqrt(a * a + b * b + c * c) || 1; out[0] = a / l; out[1] = b / l; out[2] = c / l;
  };

  /* Surface Nets: Iso-Fläche bei level → indiziertes Netz mit Normalen aus dem Feld */
  X.surface = function (g, level, opt) {
    opt = opt || {}; level = level || 0; const { nx, ny, nz, h, ox, oy, oz, d } = g, sx = 1, sy = nx, sz = nx * ny;
    const cv = new Int32Array(nx * ny * nz).fill(-1), P = [];
    const co = [0, sx, sy, sx + sy, sz, sx + sz, sy + sz, sx + sy + sz], cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], v = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const p = i + nx * (j + ny * k); let m = 0;
      for (let c = 0; c < 8; c++) { v[c] = d[p + co[c]]; if (v[c] < level) m |= 1 << c; }
      if (m === 0 || m === 255) continue;
      let ax = 0, ay = 0, az = 0, n = 0;
      for (let e = 0; e < 12; e++) {
        const a = E[e][0], b = E[e][1]; if (((m >> a) & 1) === ((m >> b) & 1)) continue;
        const t = (level - v[a]) / (v[b] - v[a]); ax += cx[a] + t * (cx[b] - cx[a]); ay += cy[a] + t * (cy[b] - cy[a]); az += cz[a] + t * (cz[b] - cz[a]); n++;
      }
      cv[p] = P.length / 3; P.push(ox + (i + ax / n) * h, oy + (j + ay / n) * h, oz + (k + az / n) * h);
    }
    const I = [], quad = (a, b, c, e, flip) => {
      if (a < 0 || b < 0 || c < 0 || e < 0) return;
      if (flip) { const t = b; b = e; e = t; }
      const d1 = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2, d2 = (P[b * 3] - P[e * 3]) ** 2 + (P[b * 3 + 1] - P[e * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[e * 3 + 2]) ** 2;
      if (d1 <= d2) I.push(a, b, c, a, c, e); else I.push(a, b, e, b, c, e);
    };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const p = i + nx * (j + ny * k), a = d[p] < level;
      if (a !== (d[p + sx] < level)) quad(cv[p - sy - sz], cv[p - sz], cv[p], cv[p - sy], !a);              // x-Kante: Zellen (j-1,k-1),(j,k-1),(j,k),(j-1,k)
      if (a !== (d[p + sy] < level)) quad(cv[p - sz - sx], cv[p - sx], cv[p], cv[p - sz], !a);              // y-Kante: (k-1,i-1),(k,i-1),(k,i),(k-1,i)
      if (a !== (d[p + sz] < level)) quad(cv[p - sx - sy], cv[p - sy], cv[p], cv[p - sx], !a);              // z-Kante: (i-1,j-1),(j-1,i),(i,j),(i-1,j)
    }
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(P), nor = new Float32Array(P.length), t = [0, 0, 0];
    for (let q = 0; q < pos.length; q += 3) { X.normalAt(g, pos[q], pos[q + 1], pos[q + 2], t); nor[q] = t[0]; nor[q + 1] = t[1]; nor[q + 2] = t[2]; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(I);
    if (opt.recompute) geo.computeVertexNormals();
    geo.computeBoundingSphere(); geo.computeBoundingBox(); return geo;
  };

  /* Box-Weichzeichner (je Achse) für Dichtefelder */
  X.blur = function (g, iters) {
    const { nx, ny, nz } = g; let a = g.d, b = new Float32Array(a.length), sx = 1, sy = nx, sz = nx * ny;
    const pass = (n1, n2, n3, s1, s2, s3) => {
      for (let u = 0; u < n3; u++) for (let w = 0; w < n2; w++) { const base = u * s3 + w * s2;
        for (let i = 0; i < n1; i++) { const p = base + i * s1, l = i > 0 ? p - s1 : p, r = i < n1 - 1 ? p + s1 : p; b[p] = (a[l] + a[p] * 2 + a[r]) * 0.25; } }
      const t = a; a = b; b = t;
    };
    for (let it = 0; it < iters; it++) { pass(nx, ny, nz, sx, sy, sz); pass(ny, nx, nz, sy, sx, sz); pass(nz, nx, ny, sz, sx, sy); }
    g.d = a; return g;
  };

  /* Taubin-Glättung (schrumpft nicht): Schritt λ, dann μ */
  X.taubin = function (geo, iters, lam, mu) {
    lam = lam === undefined ? 0.5 : lam; mu = mu === undefined ? -0.53 : mu;
    const adj = F.geo.adjacency(geo), P = geo.attributes.position.array, n = geo.attributes.position.count; let cur = P, nxt = new Float32Array(P.length);
    const step = f => {
      for (let i = 0; i < n; i++) {
        const s = adj.start[i], e = adj.start[i + 1], k = e - s; if (!k) { nxt[i * 3] = cur[i * 3]; nxt[i * 3 + 1] = cur[i * 3 + 1]; nxt[i * 3 + 2] = cur[i * 3 + 2]; continue; }
        let x = 0, y = 0, z = 0; for (let j = s; j < e; j++) { const v = adj.list[j] * 3; x += cur[v]; y += cur[v + 1]; z += cur[v + 2]; }
        nxt[i * 3] = cur[i * 3] + (x / k - cur[i * 3]) * f; nxt[i * 3 + 1] = cur[i * 3 + 1] + (y / k - cur[i * 3 + 1]) * f; nxt[i * 3 + 2] = cur[i * 3 + 2] + (z / k - cur[i * 3 + 2]) * f;
      }
      const t = cur; cur = nxt; nxt = t;
    };
    for (let it = 0; it < iters; it++) { step(lam); step(mu); }
    if (cur !== P) P.set(cur); geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere(); geo.computeBoundingBox(); return geo;
  };

  /* Gewichtete Punkte trilinear in ein Dichtefeld verteilen. w optional (je Punkt) */
  X.splatPoints = function (g, pos, w, radiusCells) {
    const { nx, ny, nz, h, ox, oy, oz } = g, d = g.d, n = pos.length / 3, r = Math.max(0, radiusCells || 0);
    for (let q = 0; q < n; q++) {
      const fx = (pos[q * 3] - ox) / h, fy = (pos[q * 3 + 1] - oy) / h, fz = (pos[q * 3 + 2] - oz) / h, wt = w ? w[q] : 1;
      if (r > 0) { // Kugel mit Radius r (in Zellen), lineares Abklingen
        const x0 = Math.max(0, Math.floor(fx - r)), x1 = Math.min(nx - 1, Math.ceil(fx + r)), y0 = Math.max(0, Math.floor(fy - r)), y1 = Math.min(ny - 1, Math.ceil(fy + r)), z0 = Math.max(0, Math.floor(fz - r)), z1 = Math.min(nz - 1, Math.ceil(fz + r));
        for (let k = z0; k <= z1; k++) for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { const dd = Math.sqrt((i - fx) ** 2 + (j - fy) ** 2 + (k - fz) ** 2); if (dd < r) d[i + nx * (j + ny * k)] += wt * (1 - dd / r); }
        continue;
      }
      const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz); if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) continue;
      const tx = fx - i, ty = fy - j, tz = fz - k, p = i + nx * (j + ny * k);
      d[p] += wt * (1 - tx) * (1 - ty) * (1 - tz); d[p + 1] += wt * tx * (1 - ty) * (1 - tz); d[p + nx] += wt * (1 - tx) * ty * (1 - tz); d[p + nx + 1] += wt * tx * ty * (1 - tz);
      const s = nx * ny; d[p + s] += wt * (1 - tx) * (1 - ty) * tz; d[p + s + 1] += wt * tx * (1 - ty) * tz; d[p + s + nx] += wt * (1 - tx) * ty * tz; d[p + s + nx + 1] += wt * tx * ty * tz;
    }
    return g;
  };

  /* Vertexfarben aus nächsten Punkten (räumlicher Hash). cols: Float32/Uint8 (0..1 oder 0..255 je nach scale) */
  X.colorFromPoints = function (geo, pos, cols, cell, scale) {
    const n = pos.length / 3, key = (i, j, k) => i * 73856093 ^ j * 19349663 ^ k * 83492791, map = new Map(); scale = scale || 1;
    for (let q = 0; q < n; q++) { const kk = key(Math.floor(pos[q * 3] / cell), Math.floor(pos[q * 3 + 1] / cell), Math.floor(pos[q * 3 + 2] / cell)); let l = map.get(kk); if (!l) map.set(kk, l = []); l.push(q); }
    const P = geo.attributes.position.array, vn = P.length / 3, C = new Float32Array(vn * 3);
    for (let v = 0; v < vn; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell); let r = 0, g = 0, b = 0, wsum = 0;
      for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let c = -1; c <= 1; c++) { const l = map.get(key(ci + a, cj + bb, ck + c)); if (!l) continue;
        for (let t = 0; t < l.length; t++) { const q = l[t], dx = pos[q * 3] - x, dy = pos[q * 3 + 1] - y, dz = pos[q * 3 + 2] - z, w = 1 / (1e-6 + dx * dx + dy * dy + dz * dz); r += cols[q * 3] * w; g += cols[q * 3 + 1] * w; b += cols[q * 3 + 2] * w; wsum += w; } }
      if (wsum > 0) { C[v * 3] = r / wsum * scale; C[v * 3 + 1] = g / wsum * scale; C[v * 3 + 2] = b / wsum * scale; } else { C[v * 3] = C[v * 3 + 1] = C[v * 3 + 2] = 0.6; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3)); return geo;
  };

  /* Kleine Komponenten entfernen (Dreieckszahl < minTris) */
  X.dropSmall = function (geo, minTris) {
    const idx = geo.index.array, n = geo.attributes.position.count, par = new Int32Array(n).map((_, i) => i), find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]), b = find(idx[i + 1]), c = find(idx[i + 2]); par[b] = a; par[find(c)] = a; }
    const cnt = new Map(); for (let i = 0; i < idx.length; i += 3) { const r = find(idx[i]); cnt.set(r, (cnt.get(r) || 0) + 1); }
    const keep = []; for (let i = 0; i < idx.length; i += 3) if (cnt.get(find(idx[i])) >= minTris) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    if (keep.length === idx.length) return geo; geo.setIndex(keep); return geo;
  };

  /* Ungenutzte Punkte entfernen (nach dropSmall) */
  X.compact = function (geo) {
    const idx = geo.index.array, n = geo.attributes.position.count, map = new Int32Array(n).fill(-1); let m = 0;
    for (let i = 0; i < idx.length; i++) if (map[idx[i]] < 0) map[idx[i]] = m++;
    const out = new THREE.BufferGeometry();
    Object.keys(geo.attributes).forEach(k => { const a = geo.attributes[k], it = a.itemSize, arr = new Float32Array(m * it); for (let v = 0; v < n; v++) { const t = map[v]; if (t >= 0) for (let c = 0; c < it; c++) arr[t * it + c] = a.array[v * it + c]; } out.setAttribute(k, new THREE.BufferAttribute(arr, it)); });
    const I = new Uint32Array(idx.length); for (let i = 0; i < idx.length; i++) I[i] = map[idx[i]]; out.setIndex(new THREE.BufferAttribute(I, 1)); out.computeBoundingSphere(); out.computeBoundingBox(); return out;
  };

  /* Indiziert → nicht indiziert, mit Normalen und UVs vom Aufrufer-Callback uvFn(x,y,z,nx,ny,nz,triIndex,cornerIndex) */
  return X;
})();
