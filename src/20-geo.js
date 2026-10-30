/* ============================================================
   Geometrie-Werkzeuge: Weld, Unterteilen, Glätten, Spiegeln, Array,
   Hohlkörper, Deformer, UV-Projektionen, Zusammenführen
   ============================================================ */
F.geo = (function () {
  const G = {};

  G.plain = function (g) {  // nicht indiziert, mit position/normal/uv
    let r = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(r.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') r.deleteAttribute(k);
    r.clearGroups();
    if (!r.attributes.normal) r.computeVertexNormals();
    if (!r.attributes.uv) r.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(r.attributes.position.count * 2), 2));
    return r;
  };

  /* Punkte mit gleicher Position (optional gleicher UV) zusammenfassen -> indiziert, Normalen glatt */
  G.weld = function (g, keepUV) {
    const pos = g.attributes.position, uv = keepUV ? g.attributes.uv : null, idx = g.index, n = pos.count;
    const map = new Map(), P = [], U = [], remap = new Uint32Array(n), q = 1e5;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let key = Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q);
      if (uv) key += ',' + Math.round(uv.getX(i) * 1e4) + ',' + Math.round(uv.getY(i) * 1e4);
      let j = map.get(key);
      if (j === undefined) { j = P.length / 3; map.set(key, j); P.push(x, y, z); if (uv) U.push(uv.getX(i), uv.getY(i)); }
      remap[i] = j;
    }
    const I = [], cnt = idx ? idx.count : n;
    for (let i = 0; i + 2 < cnt; i += 3) {
      const a = remap[idx ? idx.getX(i) : i], b = remap[idx ? idx.getX(i + 1) : i + 1], c = remap[idx ? idx.getX(i + 2) : i + 2];
      if (a === b || b === c || a === c) continue;
      I.push(a, b, c);
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (uv) r.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    r.setIndex(I);
    r.computeVertexNormals(); r.computeBoundingSphere(); r.computeBoundingBox();
    return r;
  };

  /* Nachbarschaft (CSR) eines indizierten Netzes */
  G.adjacency = function (g) {
    const n = g.attributes.position.count, idx = g.index.array, sets = new Array(n);
    for (let i = 0; i < n; i++) sets[i] = new Set();
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
    }
    const start = new Uint32Array(n + 1); let tot = 0;
    for (let i = 0; i < n; i++) { start[i] = tot; tot += sets[i].size; }
    start[n] = tot;
    const list = new Uint32Array(tot);
    for (let i = 0; i < n; i++) { let k = start[i]; sets[i].forEach(v => list[k++] = v); }
    return { start, list };
  };

  /* Einfach unterteilen (jedes Dreieck -> 4), UVs bleiben erhalten */
  G.subdivideFlat = function (g) {
    const w = g.index ? g : G.weld(g, true);
    const pos = w.attributes.position, uv = w.attributes.uv, idx = w.index.array;
    const P = Array.from(pos.array), U = uv ? Array.from(uv.array) : null, cache = new Map(), N = pos.count;
    const mid = (a, b) => {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      let m = cache.get(key); if (m !== undefined) return m;
      m = P.length / 3; cache.set(key, m);
      P.push((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
      if (U) U.push((U[a * 2] + U[b * 2]) / 2, (U[a * 2 + 1] + U[b * 2 + 1]) / 2);
      return m;
    };
    const I = [];
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (U) r.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    r.setIndex(I); r.computeVertexNormals(); r.computeBoundingSphere(); r.computeBoundingBox();
    return r;
  };

  /* Glatt unterteilen (Loop-Verfahren, ohne UVs) */
  G.subdivideLoop = function (g) {
    const w = G.weld(g, false), pos = w.attributes.position.array, idx = w.index.array, n = w.attributes.position.count;
    const edges = new Map(); // key -> {a,b,opp:[..]}
    const key = (a, b) => a < b ? a * 4194304 + b : b * 4194304 + a;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const t = [idx[i], idx[i + 1], idx[i + 2]];
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3], kk = key(a, b);
        let e = edges.get(kk); if (!e) { e = { a, b, opp: [] }; edges.set(kk, e); }
        e.opp.push(c);
      }
    }
    const nb = Array.from({ length: n }, () => new Set()), bnd = new Array(n).fill(false), bn = Array.from({ length: n }, () => []);
    edges.forEach(e => {
      nb[e.a].add(e.b); nb[e.b].add(e.a);
      if (e.opp.length === 1) { bnd[e.a] = bnd[e.b] = true; bn[e.a].push(e.b); bn[e.b].push(e.a); }
    });
    const P = new Float32Array((n + edges.size) * 3), mid = new Map();
    // alte Punkte
    for (let i = 0; i < n; i++) {
      const k = nb[i].size; let x = 0, y = 0, z = 0;
      if (bnd[i] && bn[i].length >= 2) {
        const a = bn[i][0], b = bn[i][1];
        x = 0.75 * pos[i * 3] + 0.125 * (pos[a * 3] + pos[b * 3]); y = 0.75 * pos[i * 3 + 1] + 0.125 * (pos[a * 3 + 1] + pos[b * 3 + 1]); z = 0.75 * pos[i * 3 + 2] + 0.125 * (pos[a * 3 + 2] + pos[b * 3 + 2]);
      } else {
        const beta = k === 3 ? 3 / 16 : 3 / (8 * Math.max(k, 1));
        let sx = 0, sy = 0, sz = 0; nb[i].forEach(j => { sx += pos[j * 3]; sy += pos[j * 3 + 1]; sz += pos[j * 3 + 2]; });
        x = (1 - k * beta) * pos[i * 3] + beta * sx; y = (1 - k * beta) * pos[i * 3 + 1] + beta * sy; z = (1 - k * beta) * pos[i * 3 + 2] + beta * sz;
      }
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    }
    // neue Kantenpunkte
    let m = n;
    edges.forEach((e, kk) => {
      let x, y, z;
      if (e.opp.length === 2) {
        const c = e.opp[0], d = e.opp[1];
        x = 0.375 * (pos[e.a * 3] + pos[e.b * 3]) + 0.125 * (pos[c * 3] + pos[d * 3]);
        y = 0.375 * (pos[e.a * 3 + 1] + pos[e.b * 3 + 1]) + 0.125 * (pos[c * 3 + 1] + pos[d * 3 + 1]);
        z = 0.375 * (pos[e.a * 3 + 2] + pos[e.b * 3 + 2]) + 0.125 * (pos[c * 3 + 2] + pos[d * 3 + 2]);
      } else {
        x = (pos[e.a * 3] + pos[e.b * 3]) / 2; y = (pos[e.a * 3 + 1] + pos[e.b * 3 + 1]) / 2; z = (pos[e.a * 3 + 2] + pos[e.b * 3 + 2]) / 2;
      }
      P[m * 3] = x; P[m * 3 + 1] = y; P[m * 3 + 2] = z; mid.set(kk, m++);
    });
    const I = [];
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2], ab = mid.get(key(a, b)), bc = mid.get(key(b, c)), ca = mid.get(key(c, a));
      I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.BufferAttribute(P, 3)); r.setIndex(I);
    r.computeVertexNormals(); r.computeBoundingSphere(); r.computeBoundingBox();
    return r;
  };

  /* Laplace-Glättung (verändert eine Kopie) */
  G.smooth = function (g, iterations, lambda) {
    const w = G.weld(g, false), adj = G.adjacency(w), P = w.attributes.position.array, n = w.attributes.position.count;
    let cur = Float32Array.from(P), nxt = new Float32Array(P.length);
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < n; i++) {
        const s = adj.start[i], e = adj.start[i + 1], k = e - s;
        if (!k) { nxt[i * 3] = cur[i * 3]; nxt[i * 3 + 1] = cur[i * 3 + 1]; nxt[i * 3 + 2] = cur[i * 3 + 2]; continue; }
        let x = 0, y = 0, z = 0;
        for (let j = s; j < e; j++) { const v = adj.list[j]; x += cur[v * 3]; y += cur[v * 3 + 1]; z += cur[v * 3 + 2]; }
        nxt[i * 3] = cur[i * 3] + (x / k - cur[i * 3]) * lambda;
        nxt[i * 3 + 1] = cur[i * 3 + 1] + (y / k - cur[i * 3 + 1]) * lambda;
        nxt[i * 3 + 2] = cur[i * 3 + 2] + (z / k - cur[i * 3 + 2]) * lambda;
      }
      const t = cur; cur = nxt; nxt = t;
    }
    P.set(cur);
    w.computeVertexNormals(); w.computeBoundingSphere(); w.computeBoundingBox();
    return w;
  };

  /* Zusammenführen mehrerer nicht-indizierter Geometrien */
  G.merge = function (list) {
    let total = 0; const parts = list.map(g => { const p = g.attributes.normal && g.attributes.uv && !g.index ? g : G.plain(g); total += p.attributes.position.count; return p; });
    const P = new Float32Array(total * 3), N = new Float32Array(total * 3), U = new Float32Array(total * 2); let o = 0;
    for (const p of parts) {
      P.set(p.attributes.position.array, o * 3); N.set(p.attributes.normal.array, o * 3); U.set(p.attributes.uv.array, o * 2); o += p.attributes.position.count;
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.BufferAttribute(P, 3)); r.setAttribute('normal', new THREE.BufferAttribute(N, 3)); r.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    r.computeBoundingSphere(); r.computeBoundingBox();
    return r;
  };

  G.mirror = function (g, axis, cut) {
    let base = G.plain(g);
    if (cut) { // nur Dreiecke auf der positiven Seite behalten
      const p = base.attributes.position, nrm = base.attributes.normal, uv = base.attributes.uv, keep = [];
      for (let i = 0; i + 2 < p.count; i += 3) {
        const c = (p.getComponent(i, axis) + p.getComponent(i + 1, axis) + p.getComponent(i + 2, axis)) / 3;
        if (c >= -1e-9) keep.push(i);
      }
      const P = [], N = [], U = [];
      for (const i of keep) for (let k = 0; k < 3; k++) {
        P.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k)); N.push(nrm.getX(i + k), nrm.getY(i + k), nrm.getZ(i + k)); U.push(uv.getX(i + k), uv.getY(i + k));
      }
      base = new THREE.BufferGeometry();
      base.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); base.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); base.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    }
    const m = base.clone(), P = m.attributes.position.array, N = m.attributes.normal.array, U = m.attributes.uv.array, cnt = m.attributes.position.count;
    for (let i = 0; i < cnt; i++) { P[i * 3 + axis] *= -1; N[i * 3 + axis] *= -1; }
    for (let i = 0; i + 2 < cnt; i += 3) { // Wicklung umkehren: Vertex 1 <-> 2
      for (let c = 0; c < 3; c++) { let t = P[(i + 1) * 3 + c]; P[(i + 1) * 3 + c] = P[(i + 2) * 3 + c]; P[(i + 2) * 3 + c] = t; t = N[(i + 1) * 3 + c]; N[(i + 1) * 3 + c] = N[(i + 2) * 3 + c]; N[(i + 2) * 3 + c] = t; }
      for (let c = 0; c < 2; c++) { const t = U[(i + 1) * 2 + c]; U[(i + 1) * 2 + c] = U[(i + 2) * 2 + c]; U[(i + 2) * 2 + c] = t; }
    }
    return G.merge([base, m]);
  };

  G.array = function (g, count, off) {
    const base = G.plain(g), list = [];
    for (let i = 0; i < count; i++) { const c = base.clone(); c.translate(off[0] * i, off[1] * i, off[2] * i); list.push(c); }
    return G.merge(list);
  };

  /* Hohlkörper: Innenschale entlang der Normalen versetzen */
  G.shell = function (g, t) {
    const w = G.weld(g, false), pos = w.attributes.position, nor = w.attributes.normal, idx = w.index.array;
    const outer = new THREE.BufferGeometry(), inner = new THREE.BufferGeometry();
    const n = pos.count, A = new Float32Array(n * 3), B = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { A[i * 3 + c] = pos.array[i * 3 + c]; B[i * 3 + c] = pos.array[i * 3 + c] - nor.array[i * 3 + c] * t; }
    outer.setAttribute('position', new THREE.BufferAttribute(A, 3)); outer.setIndex(Array.from(idx)); outer.computeVertexNormals();
    const rev = []; for (let i = 0; i + 2 < idx.length; i += 3) rev.push(idx[i], idx[i + 2], idx[i + 1]);
    inner.setAttribute('position', new THREE.BufferAttribute(B, 3)); inner.setIndex(rev); inner.computeVertexNormals();
    return G.merge([outer, inner]);
  };

  /* Deformer auf Positionen (Y-Achse). Gibt neue Positionsliste zurück */
  G.deform = function (g, kind, amount) {
    const pos = g.attributes.position, p = pos.array, n = pos.count;
    let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < n; i++) { const y = p[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const hgt = Math.max(1e-9, y1 - y0), ym = (y0 + y1) / 2;
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], t = (y - y0) / hgt;
      if (kind === 'twist') {
        const a = amount * DEG * (t - 0.5), c = Math.cos(a), s = Math.sin(a);
        p[i * 3] = x * c - z * s; p[i * 3 + 2] = x * s + z * c;
      } else if (kind === 'taper') {
        const f = Math.max(0.0001, 1 + amount * (t - 0.5)); p[i * 3] = x * f; p[i * 3 + 2] = z * f;
      } else if (kind === 'bend') {
        const A = amount * DEG; if (Math.abs(A) < 1e-6) continue;
        const R = hgt / A, phi = (y - ym) / R;
        p[i * 3] = R - (R - x) * Math.cos(phi); p[i * 3 + 1] = ym + (R - x) * Math.sin(phi);
      }
    }
    pos.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  };

  /* UV-Projektionen (nur nicht-indiziert) */
  G.uv = function (g, kind, scale) {
    const r = G.plain(g), p = r.attributes.position, uv = r.attributes.uv, n = p.count;
    scale = scale || 1; r.computeBoundingBox(); const bb = r.boundingBox, size = bb.getSize(new THREE.Vector3());
    for (let i = 0; i + 2 < n; i += 3) {
      let ax = 1;
      if (kind === 'box') {
        const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
        const nn = b.sub(a).cross(c.sub(new THREE.Vector3().fromBufferAttribute(p, i)));
        const ax_ = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z); ax = ax_ >= ay && ax_ >= az ? 0 : ay >= az ? 1 : 2;
      }
      for (let k = 0; k < 3; k++) {
        const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k); let u, v;
        if (kind === 'box') { if (ax === 0) { u = z; v = y; } else if (ax === 1) { u = x; v = z; } else { u = x; v = y; } u *= scale; v *= scale; }
        else if (kind === 'sphere') { const rr = Math.sqrt(x * x + y * y + z * z) || 1; u = Math.atan2(z, x) / (2 * Math.PI) + 0.5; v = Math.asin(clamp(y / rr, -1, 1)) / Math.PI + 0.5; }
        else if (kind === 'cylinder') { u = Math.atan2(z, x) / (2 * Math.PI) + 0.5; v = (y - bb.min.y) / Math.max(size.y, 1e-6); }
        else { u = (x - bb.min.x) / Math.max(size.x, 1e-6); v = (z - bb.min.z) / Math.max(size.z, 1e-6); } // planar von oben
        uv.setXY(i + k, u, v);
      }
    }
    uv.needsUpdate = true; return r;
  };

  /* Vereinfachen: Punkte in Zellen zusammenfassen (Clustering); die Zellgröße wird gesucht, bis etwa ratio der Dreiecke bleibt. UVs gehen verloren. */
  G.decimate = function (g, ratio) {
    const w = G.weld(g, false), pos = w.attributes.position.array, idx = w.index.array, n = pos.length / 3, T0 = idx.length / 3, target = Math.max(8, Math.floor(T0 * ratio));
    w.computeBoundingBox(); const bb = w.boundingBox, size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
    const run = cell => {
      const map = new Map(), sum = [], cnt = [], remap = new Uint32Array(n);
      for (let i = 0; i < n; i++) { const ix = Math.floor((pos[i * 3] - bb.min.x) / cell), iy = Math.floor((pos[i * 3 + 1] - bb.min.y) / cell), iz = Math.floor((pos[i * 3 + 2] - bb.min.z) / cell), key = ix + 4096 * (iy + 4096 * iz); let j = map.get(key); if (j === undefined) { j = cnt.length; map.set(key, j); sum.push(0, 0, 0); cnt.push(0); } remap[i] = j; sum[j * 3] += pos[i * 3]; sum[j * 3 + 1] += pos[i * 3 + 1]; sum[j * 3 + 2] += pos[i * 3 + 2]; cnt[j]++; }
      const I = []; for (let t = 0; t < T0; t++) { const a = remap[idx[t * 3]], b = remap[idx[t * 3 + 1]], c = remap[idx[t * 3 + 2]]; if (a !== b && b !== c && a !== c) I.push(a, b, c); }
      return { sum, cnt, I };
    };
    let lo = size / 3000, hi = size / 2, best = null;
    for (let i = 0; i < 16; i++) { const mid = Math.sqrt(lo * hi), r = run(mid); if (r.I.length / 3 >= target) { best = r; lo = mid; } else hi = mid; }
    if (!best) best = run(lo);
    const P = new Float32Array(best.cnt.length * 3); for (let j = 0; j < best.cnt.length; j++) { P[j * 3] = best.sum[j * 3] / best.cnt[j]; P[j * 3 + 1] = best.sum[j * 3 + 1] / best.cnt[j]; P[j * 3 + 2] = best.sum[j * 3 + 2] / best.cnt[j]; }
    const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(P, 3)); r.setIndex(best.I); r.computeVertexNormals(); r.computeBoundingSphere(); r.computeBoundingBox(); return r;
  };

  G.stats = function (g) { const v = g.attributes.position.count; return { verts: v, tris: Math.floor((g.index ? g.index.count : v) / 3) }; };

  /* Weltmatrix in die Geometrie einbacken */
  G.bake = function (obj) {
    obj.updateMatrix();
    const m = obj.matrix.clone();
    obj.geometry.applyMatrix4(m);
    obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.set(1, 1, 1); obj.updateMatrix();
    obj.geometry.computeBoundingSphere(); obj.geometry.computeBoundingBox();
  };
  /* Ursprung in die Mitte der Hülle legen, Objekt bleibt optisch stehen */
  G.recenter = function (obj, mode) {
    const g = obj.geometry; g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    if (mode === 'bottom') c.y = g.boundingBox.min.y;
    g.translate(-c.x, -c.y, -c.z);
    c.multiply(obj.scale).applyQuaternion(obj.quaternion);
    obj.position.add(c); obj.updateMatrix();
    g.computeBoundingSphere(); g.computeBoundingBox();
  };
  /* Weltraum-Geometrie mehrerer Objekte als ein Netz */
  G.joined = function (objs) {
    const parts = objs.map(o => {
      o.updateMatrixWorld(true);
      const g = G.plain(o.geometry); g.applyMatrix4(o.matrixWorld); return g;
    });
    return G.merge(parts);
  };
  return G;
})();
