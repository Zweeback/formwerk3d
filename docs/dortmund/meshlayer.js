/* Foto-Mesh-Schicht (NRW 3D-Mesh, ultraleicht): lädt nur die Kacheln, die man gerade braucht.
   Aufruf:  index.html?mesh=<Ordner>   (Ordner mit manifest.json und *.msh, siehe tools/fetch_mesh2.py)
   Weitere Parameter:  msse=4  (Bildschirmfehler in Pixeln, kleiner = schärfer),  mcache=900 (Kacheln im Speicher),  mhide=cover|all|none  (altes Gelände ausblenden),
   mconc=6 (gleichzeitige Abrufe),  mgamma=0.82 / msat=0.88 (Schatten aufhellen, Blaustich mindern; 1 = aus),
   mnear=320 (Fahrmodus: Radius in m um das Auto, in dem das alte, saubere Gelände (LoD2) stehen bleibt und das Mesh nur dahinter als Kulisse erscheint; 0 = Mesh überall).
   Stufen: Knotenbaum des Meshes (Tiefe 20 = fein ... 17 = grob). Ein Knoten wird durch seine Kinder ersetzt, sobald alle sichtbaren Kinder geladen sind
   (kein Aufblitzen, kein Loch). Format .msh: siehe tools/fetch_mesh2.py. Quelle: Geobasis NRW, 3D-Mesh, Datenlizenz Deutschland - Zero - Version 2.0. */
(function () {
  const q = new URLSearchParams(location.search), DIR0 = q.get('mesh'); if (!DIR0) return;
  const DIRS = DIR0.split(',').map(d => d.replace(/\/?$/, '/')), MSSE = +(q.get('msse') || 4), MCACHE = +(q.get('mcache') || 900), CONC = +(q.get('mconc') || 6), HIDE = q.get('mhide') || 'cover', GAM = +(q.get('mgamma') || 0.82), SAT = +(q.get('msat') || 0.88), NEAR = +(q.get('mnear') || 320);
  (async function boot() {
    while (!(window.__ready && window.__v && window.__v.core)) await new Promise(r => setTimeout(r, 50));
    const V = window.__v, { THREE: T, scene, cam, renderer, sun, hemi } = V.core;
    // Mehrere Ordner möglich (mesh=city/,city3/): jeder hat seinen eigenen Knotenbaum und eigene Nummern
    const man = { nodes: [] }, N = new Map(); let bytes = 0, fetches = 0;
    for (let di = 0; di < DIRS.length; di++) {
      const m = await (await fetch(DIRS[di] + 'manifest.json')).json();
      for (const n of m.nodes) { n.dir = DIRS[di]; n.key = di + ':' + n.id; n.pkey = di + ':' + n.p; const b = n.box; n.c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]; n.r = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2; n.ge = 0.6 * Math.pow(2, 20 - n.d); n.st = 0; n.mesh = null; n.last = 0; N.set(n.key, n); man.nodes.push(n); }
    }
    for (const n of man.nodes) { n.kids = (n.ch || []).map(i => N.get(n.key.split(':')[0] + ':' + i)).filter(Boolean); n.full = n.kids.length > 0 && n.kids.length === (n.ch || []).length; }   // nur verfeinern, wenn ALLE Kinder vorhanden sind (sonst Loch am Rand eines fein umgewandelten Gebiets)
    const roots = man.nodes.filter(n => !N.has(n.pkey));
    const group = new T.Group(); group.name = 'FotoMesh'; scene.add(group);
    // Abdeckung (8 m Raster) → alte Kacheln dort ausblenden, wo das Mesh sie ganz ersetzt
    const GW = 640, GH = 512, GR = 8, cov = new Uint8Array(GW * GH);
    for (const n of man.nodes) { const b = n.box; for (let j = Math.max(0, Math.floor(-b[5] / GR)); j <= Math.min(GH - 1, Math.floor(-b[2] / GR)); j++) for (let i = Math.max(0, Math.floor(b[0] / GR)); i <= Math.min(GW - 1, Math.floor(b[3] / GR)); i++) cov[j * GW + i] = 1; }
    function covers(cx, cz) {
      if (HIDE === 'none') return false; if (HIDE === 'all') return true;
      const CS = V.M.cell, x0 = cx * CS, z0 = -(cz + 1) * CS; let s = 0, c = 0;
      for (let z = z0 + GR / 2; z < z0 + CS; z += GR) for (let x = x0 + GR / 2; x < x0 + CS; x += GR) { c++; const i = Math.floor(x / GR), j = Math.floor(-z / GR); if (i >= 0 && i < GW && j >= 0 && j < GH) s += cov[j * GW + i]; }
      return s / c > 0.985;
    }
    // Fahrmodus: Zellen in der Nähe des Autos zeigen das alte Gelände, das Mesh erscheint nur dahinter (Fahrhöhe: Fassaden/Bäume des Meshes verdecken sonst das Auto)
    const nearCells = new Set(); let nearOn = false;
    function updateNear() {
      nearCells.clear(); nearOn = !!V.core.driving && NEAR > 0; if (!nearOn) return; const CS = V.M.cell, p = cam.position;
      for (let cz = 0; cz < V.M.grid[1]; cz++) for (let cx = 0; cx < V.M.grid[0]; cx++) { const x0 = cx * CS, z0 = -(cz + 1) * CS, dx = Math.max(x0 - p.x, 0, p.x - (x0 + CS)), dz = Math.max(z0 - p.z, 0, p.z - (z0 + CS)); if (Math.hypot(dx, dz) < NEAR) nearCells.add(cx + ',' + cz); }
    }
    const inNear = (x, z) => nearCells.has(Math.floor(x / V.M.cell) + ',' + Math.floor(-z / V.M.cell));
    const nodeInNear = n => { const b = n.box; return inNear(b[0], b[2]) && inNear(b[3], b[2]) && inNear(b[0], b[5]) && inNear(b[3], b[5]) && inNear(n.c[0], n.c[2]); };
    const cellVisible = (cx, cz) => nearOn ? (nearCells.has(cx + ',' + cz) || !covers(cx, cz)) : !covers(cx, cz);
    const refreshCover = () => { updateNear(); if (V.tiles) V.tiles.forEach(t => { if (t.group) t.group.visible = cellVisible(t.cx, t.cz); }); };
    // Laden
    const queue = []; let inflight = 0, loaded = 0, evicted = 0;
    async function loadNode(n) {
      n.st = 1; inflight++;
      try {
        const r = await fetch(n.dir + n.f); if (!r.ok) throw new Error(r.status); const buf = await r.arrayBuffer(); bytes += buf.byteLength; fetches++;
        const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x3348534d) throw new Error('kein MSH3');   // "MSH3"
        const nv = dv.getUint32(4, true), nt = dv.getUint32(8, true), lo = [0, 1, 2].map(i => dv.getFloat64(12 + 8 * i, true)), sc = [0, 1, 2].map(i => dv.getFloat64(36 + 8 * i, true)), tf = dv.getUint32(60, true), tl = dv.getUint32(64, true), zl = dv.getUint32(68, true);
        const raw = new Uint8Array(await new Response(new Blob([new Uint8Array(buf, 72, zl)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        const plane = (off, n, out, stride, c) => { let acc = 0; for (let i = 0; i < n; i++) { acc = (acc + (raw[off + i] | (raw[off + n + i] << 8))) & 0xFFFF; out[i * stride + c] = acc; } };
        const pos = new Uint16Array(nv * 3), uv = new Uint16Array(nv * 2), ix = new Uint16Array(nt * 3);
        for (let c = 0; c < 3; c++) plane(c * 2 * nv, nv, pos, 3, c); for (let c = 0; c < 2; c++) plane((3 + c) * 2 * nv, nv, uv, 2, c); plane(5 * 2 * nv, nt * 3, ix, 1, 0);
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3, true)); g.setAttribute('uv', new T.BufferAttribute(uv, 2, true)); g.setIndex(new T.BufferAttribute(ix, 1));
        const blob = new Blob([new Uint8Array(buf, 72 + zl, tl)], { type: tf === 2 ? 'image/avif' : 'image/webp' }); let tex;
        if (window.createImageBitmap) { const bmp = await createImageBitmap(blob); tex = new T.Texture(bmp); }
        else { const url = URL.createObjectURL(blob), img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url); tex = new T.Texture(img); }
        tex.flipY = false; tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter; tex.magFilter = T.LinearFilter; tex.anisotropy = 4; tex.needsUpdate = true;
        const mat = new T.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(' + GAM.toFixed(3) + '));\n float lum_ = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(vec3(lum_), diffuseColor.rgb, ' + SAT.toFixed(3) + ');'); };
        mat.customProgramCacheKey = () => 'fm' + GAM + '_' + SAT;
        const m = new T.Mesh(g, mat);
        m.position.set(lo[0], lo[1], lo[2]); m.scale.set(sc[0] * 65535, sc[1] * 65535, sc[2] * 65535); m.frustumCulled = false; m.visible = false; m.matrixAutoUpdate = false; m.updateMatrix(); m.userData.nt = nt;
        group.add(m); n.mesh = m; n.st = 2; loaded++; n.last = performance.now();
      } catch (e) { n.st = 3; console.error('Mesh', n.f, e.message); }
      inflight--; pump();
    }
    function pump() { while (inflight < CONC && queue.length) { const n = queue.shift(); if (n.st === 0) loadNode(n); } }
    const want = new Set(), keep = new Set(), fr = new T.Frustum(), pm = new T.Matrix4(), cp = cam.position, cs = new T.Sphere(), tmpV = new T.Vector3(); let K = 600;
    const req = new Map();
    function ask(n, d) { if (n.st === 0 && !req.has(n)) req.set(n, d); }
    function select(n) {
      if (nearOn && nodeInNear(n)) return;
      tmpV.set(n.c[0], n.c[1], n.c[2]); cs.set(tmpV, n.r); if (!fr.intersectsSphere(cs)) return;
      const dist = Math.max(1, tmpV.distanceTo(cp) - n.r), sse = n.ge * K / dist;
      if (n.full && sse > MSSE) {
        // Kinder, die im Bild liegen, müssen geladen sein, sonst bleibt der Knoten stehen
        let ok = true; for (const k of n.kids) { tmpV.set(k.c[0], k.c[1], k.c[2]); cs.set(tmpV, k.r); if (!fr.intersectsSphere(cs)) continue; if (k.st !== 2) { ok = false; ask(k, Math.max(1, tmpV.distanceTo(cp) - k.r)); } else keep.add(k); }
        if (ok) { for (const k of n.kids) select(k); return; }
      }
      if (n.st === 2) want.add(n); else { ask(n, dist * 0.2); }
    }
    let lastT = 0, shown = 0, tris = 0;
    function update(now) {
      cam.updateMatrixWorld(); K = renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360)); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
      updateNear(); want.clear(); keep.clear(); req.clear(); for (const r of roots) select(r);
      shown = 0; tris = 0; for (const n of N.values()) if (n.mesh) { const w = want.has(n); n.mesh.visible = w; if (w) { shown++; tris += n.mesh.userData.nt; n.last = now; } else if (keep.has(n)) n.last = now; }
      if (req.size) { const a = [...req.entries()].sort((x, y) => x[1] - y[1]); for (const [n] of a) if (!queue.includes(n)) queue.push(n); queue.sort((x, y) => (req.get(x) ?? 1e9) - (req.get(y) ?? 1e9)); }
      pump();
      // Speicher begrenzen: am längsten nicht gezeigte Knoten entladen
      let have = 0; for (const n of N.values()) if (n.mesh) have++;
      if (have > MCACHE) { const old = [...N.values()].filter(n => n.mesh && !want.has(n) && !keep.has(n) && now - n.last > 2500).sort((a, b) => a.last - b.last); for (let i = 0; i < old.length && have > MCACHE; i++, have--) { const n = old[i]; group.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh.material.map.dispose(); n.mesh.material.dispose(); n.mesh = null; n.st = 0; evicted++; } }
      // Helligkeit grob mit Tageszeit
      const k = Math.max(0.22, Math.min(1, 0.2 + sun.intensity * 0.7 + hemi.intensity * 0.6)); group.children.forEach(m => m.material.color.setScalar(k));
    }
    const tick = () => { const now = performance.now(); if (now - lastT > 140) { lastT = now; update(now); } requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    refreshCover(); setInterval(refreshCover, 700);
    window.__mesh = {
      DIRS, man, N, covers, cellVisible, refreshCover, update: () => update(performance.now()),
      stats: () => ({ nodes: man.nodes.length, loaded, evicted, inflight, queued: queue.length, shown, tris, bytes, fetches, MB: +(bytes / 1048576).toFixed(2) }),
      settled: () => inflight === 0 && queue.length === 0 && req.size === 0,
    };
    console.log('Foto-Mesh bereit:', man.nodes.length, 'Knoten,', roots.length, 'Wurzeln');
  })().catch(e => console.error('meshlayer', e));
})();
