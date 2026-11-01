/* ============================================================
   Boolesche Operationen mit Manifold (WASM) – robust und schnell auch bei 100.000+ Dreiecken.
   Fällt auf die BSP-Variante (10-csg.js) zurück, wenn Manifold nicht geladen ist
   oder ein Netz nicht wasserdicht ist und klein genug für BSP.
   ============================================================ */
(function () {
  const BSP = F.csg.run, DEG = Math.PI / 180;
  const Q = 1e5;

  /* Mesh -> Manifold (Weltraum, nach Position verschweißt, UV als Eigenschaft) */
  function toManifold(lib, mesh, defCol) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv, col = g.attributes.color, idx = g.index, e = mesh.matrixWorld.elements, flip = mesh.matrixWorld.determinant() < 0;
    const cnt = idx ? idx.count : pos.count, nT = Math.floor(cnt / 3), props = [], tri = new Uint32Array(nT * 3), canon = [];
    const pMap = new Map(), cMap = new Map(); let nOut = 0;
    const vertex = i => {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const u = uv ? uv.getX(i) : 0, v = uv ? uv.getY(i) : 0, kp = Math.round(wx * Q) + ',' + Math.round(wy * Q) + ',' + Math.round(wz * Q);
      const cr = col ? col.getX(i) : defCol[0], cg = col ? col.getY(i) : defCol[1], cb = col ? col.getZ(i) : defCol[2];
      const k = kp + '|' + Math.round(u * 1e4) + ',' + Math.round(v * 1e4) + '|' + Math.round(cr * 255) + ',' + Math.round(cg * 255) + ',' + Math.round(cb * 255); let id = pMap.get(k);
      if (id === undefined) { id = props.length / 8; pMap.set(k, id); props.push(wx, wy, wz, u, v, cr, cg, cb); let c = cMap.get(kp); if (c === undefined) cMap.set(kp, id); canon.push(c === undefined ? id : c); }
      return id;
    };
    for (let t = 0; t < nT; t++) {
      let a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      if (flip) { const s = b; b = c; c = s; }
      const A = vertex(a), B = vertex(b), C = vertex(c);
      if (canon[A] === canon[B] || canon[B] === canon[C] || canon[A] === canon[C]) continue; // entartet
      tri[nOut * 3] = A; tri[nOut * 3 + 1] = B; tri[nOut * 3 + 2] = C; nOut++;
    }
    const from = [], to = []; for (let i = 0; i < canon.length; i++) if (canon[i] !== i) { from.push(i); to.push(canon[i]); }
    const opt = { numProp: 8, vertProperties: new Float32Array(props), triVerts: tri.slice(0, nOut * 3), mergeFromVert: new Uint32Array(from), mergeToVert: new Uint32Array(to) };
    let m = null, err = null;
    try { m = new lib.Manifold(new lib.Mesh(opt)); } catch (e1) {
      err = e1;
      try { const mm = new lib.Mesh(opt); mm.merge(); m = new lib.Manifold(mm); err = null; } catch (e2) { err = e2; }
    }
    if (!m) { const bad = new Error('Netz „' + mesh.name + '“ ist nicht wasserdicht (offene Kanten oder Selbstüberschneidung): ' + (err && err.message || err)); bad.notManifold = true; throw bad; }
    return m;
  }

  /* Dreiecke (nicht indiziert) -> Normalen nach Winkel geglättet */
  function creaseNormals(P, deg) {
    const nT = P.length / 9, N = new Float32Array(P.length), fn = new Float32Array(nT * 3), key = new Array(nT * 3), groups = new Map(), cs = Math.cos(deg * DEG);
    for (let t = 0; t < nT; t++) {
      const o = t * 9, ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; fn[t * 3] = nx; fn[t * 3 + 1] = ny; fn[t * 3 + 2] = nz; // Länge = 2·Fläche
      for (let c = 0; c < 3; c++) { const k = Math.round(P[o + c * 3] * Q) + ',' + Math.round(P[o + c * 3 + 1] * Q) + ',' + Math.round(P[o + c * 3 + 2] * Q); key[t * 3 + c] = k; let l = groups.get(k); if (!l) groups.set(k, l = []); l.push(t); }
    }
    for (let t = 0; t < nT; t++) {
      const fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2], fl = Math.hypot(fx, fy, fz) || 1;
      for (let c = 0; c < 3; c++) {
        let sx = 0, sy = 0, sz = 0; const l = groups.get(key[t * 3 + c]);
        for (let q = 0; q < l.length; q++) { const g = l[q], gx = fn[g * 3], gy = fn[g * 3 + 1], gz = fn[g * 3 + 2], gl = Math.hypot(gx, gy, gz) || 1; if ((gx * fx + gy * fy + gz * fz) / (gl * fl) >= cs) { sx += gx; sy += gy; sz += gz; } }
        const sl = Math.hypot(sx, sy, sz) || 1, o = t * 9 + c * 3; N[o] = sx / sl; N[o + 1] = sy / sl; N[o + 2] = sz / sl;
      }
    }
    return N;
  }

  function fromManifold(m, withColor) {
    const mesh = m.getMesh(), np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts, nT = tv.length / 3, P = new Float32Array(nT * 9), U = new Float32Array(nT * 6), C = withColor ? new Float32Array(nT * 9) : null;
    for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) { const v = tv[t * 3 + c] * np; P[t * 9 + c * 3] = vp[v]; P[t * 9 + c * 3 + 1] = vp[v + 1]; P[t * 9 + c * 3 + 2] = vp[v + 2]; if (np >= 5) { U[t * 6 + c * 2] = vp[v + 3]; U[t * 6 + c * 2 + 1] = vp[v + 4]; } if (C && np >= 8) { C[t * 9 + c * 3] = vp[v + 5]; C[t * 9 + c * 3 + 1] = vp[v + 6]; C[t * 9 + c * 3 + 2] = vp[v + 7]; } }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(creaseNormals(P, 35), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2)); if (C) geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.computeBoundingSphere(); geo.computeBoundingBox(); return geo;
  }

  function runManifold(op, ma, mb) {
    const lib = F.manifold && F.manifold.lib; if (!lib) throw new Error('Manifold nicht geladen');
    const del = []; try {
      const mc = o => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return m && m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1]; };
      const ca = mc(ma), cb = mc(mb), hasC = !!(ma.geometry.attributes.color || mb.geometry.attributes.color);
      /* Ergebnis nutzt das Material von A: Vertexfarbe × Materialfarbe. Teile ohne Farbattribut bekommen weiß (A) bzw. das Farbverhältnis B/A (Schnittflächen, Vereinigung). */
      const ratio = [0, 1, 2].map(i => Math.min(1, ca[i] > 1e-4 ? cb[i] / ca[i] : cb[i]));
      const a = toManifold(lib, ma, [1, 1, 1]); del.push(a); const b = toManifold(lib, mb, ratio); del.push(b);
      const r = op === 'union' ? a.add(b) : op === 'subtract' ? a.subtract(b) : op === 'intersect' ? a.intersect(b) : null; if (!r) throw new Error('Unbekannte Operation: ' + op); del.push(r);
      if (r.isEmpty()) throw new Error('Ergebnis ist leer (Objekte überlappen nicht?)');
      return fromManifold(r, hasC);
    } finally { del.forEach(x => { try { x.delete(); } catch (e) { /* schon frei */ } }); }
  }

  const triCount = m => { const g = m.geometry; return g.index ? g.index.count / 3 : g.attributes.position.count / 3; };
  F.csg.run = function (op, ma, mb) {
    F.csg.engine = 'bsp'; F.csg.note = '';
    if (F.manifold && F.manifold.lib) {
      try { const g = runManifold(op, ma, mb); F.csg.engine = 'manifold'; return g; }
      catch (e) { F.csg.note = e.message; if (!e.notManifold && /leer|überlappen|Unbekannte/.test(e.message)) throw e; if (Math.max(triCount(ma), triCount(mb)) > 14000) throw e.notManifold ? e : new Error('Boolesche Operation fehlgeschlagen: ' + e.message); }
    } else if (Math.max(triCount(ma), triCount(mb)) > 14000 && F.manifold && (F.manifold.ready || F.manifold.error)) {
      throw new Error(F.manifold.error
        ? 'Feine Netze (über 14.000 Dreiecke) brauchen die Manifold-Engine, sie lässt sich in dieser Umgebung nicht laden (' + F.manifold.error + '). Tipp: Datei lokal im Browser öffnen oder weniger Segmente verwenden.'
        : 'Manifold wird noch geladen – gleich nochmal versuchen (feine Netze brauchen die neue Engine)');
    }
    return BSP(op, ma, mb);
  };
  F.csg.runManifold = runManifold;
})();
