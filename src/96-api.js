/* ============================================================
   Skript-API, JSON-Befehle (für Sprachmodelle), Beispiele, Hilfe, Tastatur
   ============================================================ */
const H2 = F.history;
F.group = function (label, fn) { // mehrere Schritte als ein Rückgängig-Eintrag
  const n0 = H2.undo.length;
  try { fn(); } finally {
    const added = H2.undo.splice(n0);
    if (added.length > 1) H2.undo.push({ label, undo: () => added.slice().reverse().forEach(e => e.undo()), redo: () => added.forEach(e => e.redo()), free: { clear() { added.forEach(e => e.free && e.free.clear && e.free.clear()); }, evict() { added.forEach(e => e.free && e.free.evict && e.free.evict()); } } });
    else if (added.length === 1) H2.undo.push(added[0]);
    F.ui.refreshHistory();
  }
};
F.boolean = function (op, A, B, keep, name) {
  if (!A || !B) throw new Error('Boolesche Operation braucht zwei Objekte');
  if (A.isSkinnedMesh || B.isSkinnedMesh) throw new Error('Geriggte Meshes sind für Boolesche Operationen gesperrt');
  let geo; try { geo = F.csg.run(op, A, B); } catch (e) { throw new Error(e instanceof RangeError || /Dreieck/.test(e.message) ? e.message : 'Boolesche Operation fehlgeschlagen: ' + e.message); }
  if (!geo.attributes.position.count) throw new Error('Ergebnis ist leer – überlappen sich die Objekte?');
  const sym = { union: ' + ', subtract: ' − ', intersect: ' ∩ ' }[op], res = V.addMesh(geo, { name: name || (A.name + sym + B.name), kind: 'csg', dropToGrid: false, position: [0, 0, 0], silent: true, material: A.material.clone() });
  res.material.userData = Object.assign({}, A.material.userData); if (geo.attributes.color && !res.material.vertexColors) { res.material.vertexColors = true; res.material.needsUpdate = true; } const vis = [A.visible, B.visible];
  const hide = () => { if (keep) { A.visible = false; B.visible = false; } else { V._detach(A); V._detach(B); } };
  hide(); V.select(res);
  H2.push('Boolesch: ' + op, () => { V._detach(res); if (keep) { A.visible = vis[0]; B.visible = vis[1]; } else { V._attach(A); V._attach(B); } }, () => { hide(); V._attach(res); });
  V.refreshAll(); F.say('Ergebnis: ' + F.geo.stats(geo).tris + ' Dreiecke'); return res;
};
UI.boolean = function (op) {
  if (S.sel.length < 2) return F.say('Zwei Objekte wählen: zuerst A, dann B (Shift+Klick)', 'err');
  try { F.boolean(op, S.sel[0], S.sel[1], cadKeep); } catch (e) { F.say(e.message, 'err'); }
};

/* Mesh-Operation auf ein Objekt anwenden (Oberfläche und KI-Befehl), ein Rückgängig-Schritt */
F.meshEdit = function (ob, c) {
  if (!ob || !ob.isMesh) throw new Error('Kein Mesh');
  if (ob.isSkinnedMesh) throw new Error('Geriggte Meshes lassen sich nicht verformen');
  const op = String(c.op || '').toLowerCase(), r = F.meshops.run(ob.geometry, c); let part = null;
  F.group('Mesh: ' + op, () => {
    if (r.geo) { V.setGeometry(ob, r.geo, 'Mesh: ' + op, 'mesh', null); ob.userData.sculpt = false; }
    if (r.part) {
      const mat = ob.material.clone(); mat.userData = Object.assign({}, ob.material.userData);
      part = V.addMesh(r.part, { name: c.name || (ob.name + ' Teil'), material: mat, position: ob.position.toArray(), rotation: [ob.rotation.x / DEG, ob.rotation.y / DEG, ob.rotation.z / DEG], scale: ob.scale.toArray(), dropToGrid: false, select: false });
    }
  });
  V.refreshAll(); return { obj: ob, part, keys: r.keys, info: r.info };
};
const clampR = r => Math.max(0.02, Math.min(0.95, r > 1 ? r / 100 : r));
F.api = (function () {
  const find = n => {
    if (n && n.isMesh) return n; if (n === undefined || n === null) { if (S.active) return S.active; throw new Error('Kein Objekt angegeben'); }
    const l = V.objects(), s = String(n), o = l.find(x => x.name === s) || l.find(x => x.name.toLowerCase() === s.toLowerCase()) || l.find(x => x.name.toLowerCase().indexOf(s.toLowerCase()) === 0);
    if (!o) throw new Error('Objekt nicht gefunden: ' + s); return o;
  };
  const vec = (v, d) => Array.isArray(v) ? v.map(Number) : (typeof v === 'number' ? [v, v, v] : d);
  const place = (m, o) => {
    o = o || {};
    if (o.pos || o.position) m.position.fromArray(vec(o.pos || o.position)); if (o.rot || o.rotation) { const r = vec(o.rot || o.rotation); m.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG); }
    if (o.scale !== undefined) m.scale.fromArray(vec(o.scale, [1, 1, 1]));
    if (o.color) m.material.color.set(o.color); if (o.rough !== undefined) m.material.roughness = o.rough; if (o.metal !== undefined) m.material.metalness = o.metal;
    if (o.opacity !== undefined) { m.material.userData.opacity = o.opacity; V.applyDisplay(m); }
    if (o.name) m.name = V.uniqueName(String(o.name)); return m;
  };
  const add = (kind, o) => {
    o = o || {}; const P = F.prims[kind]; if (!P) throw new Error('Unbekannter Körper: ' + kind + ' (möglich: ' + Object.keys(F.prims).join(', ') + ')');
    const p = {}; Object.keys(P.p).forEach(k => { if (o[k] !== undefined) p[k] = +o[k]; });
    const opts = { select: false }; if (o.name) opts.name = String(o.name); if (o.pos || o.position) opts.position = vec(o.pos || o.position); if (o.color) opts.color = new THREE.Color(o.color);
    const m = V.add(kind, p, opts); place(m, { rot: o.rot || o.rotation, scale: o.scale, rough: o.rough, metal: o.metal, opacity: o.opacity }); V.refreshAll(); return m;
  };
  const api = { find, add };
  Object.keys(F.prims).forEach(k => { api[k] = o => add(k, o); });
  ['union', 'subtract', 'intersect'].forEach(op => { api[op] = (a, b, o) => { o = o || {}; return F.boolean(op, find(a), find(b), !!o.keep, o.name); }; });
  api.move = (o, p) => { const m = find(o); m.position.fromArray(vec(p)); V.refreshAll(); return m; };
  api.rotate = (o, r) => { const m = find(o), v = vec(r); m.rotation.set(v[0] * DEG, v[1] * DEG, v[2] * DEG); V.refreshAll(); return m; };
  api.scale = (o, s) => { const m = find(o); m.scale.fromArray(vec(s, [1, 1, 1])); V.refreshAll(); return m; };
  api.color = (o, c) => { const m = find(o); m.material.color.set(c); V.requestRender(); return m; };
  api.rename = (o, n) => { const m = find(o); m.name = V.uniqueName(String(n)); V.refreshAll(); return m; };
  api.remove = o => { V.remove([find(o)]); };
  api.select = o => { V.select(find(o)); };
  api.clear = () => { V.objects().forEach(o => V._detach(o)); V.select(null); };
  api.extrude = (pts, depth, o) => {
    o = o || {}; const loops = [{ pts: pts.map(p => [+p[0], +p[1]]), closed: true, hole: false }]; (o.holes || []).forEach(hl => loops.push({ pts: hl.map(p => [+p[0], +p[1]]), closed: true, hole: true }));
    F.sketch.set(loops); const m = F.sketch.extrude(depth === undefined ? 1 : depth, o.bevel || 0, o.plane === 'xz' ? 'xz' : 'xy'); place(m, o); return m;
  };
  api.lathe = (pts, seg, o) => { o = o || {}; F.sketch.set([{ pts: pts.map(p => [+p[0], +p[1]]), closed: false, hole: false }]); const m = F.sketch.lathe(seg || 48, o.angle || 360); place(m, o); return m; };
  api.map = d => { F.map.parse(typeof d === 'string' ? d : JSON.stringify(d), { planar: d && d.planar }); return F.map.build({}); };
  const axisOf = a => { const k = { x: 0, y: 1, z: 2 }[String(a === undefined ? 'x' : a).toLowerCase()]; if (k === undefined) throw new Error('Achse x, y oder z'); return k; };
  const modify = (o, label, fn) => { const m = find(o); if (m.isSkinnedMesh) throw new Error('Geriggte Meshes lassen sich nicht verformen'); V.setGeometry(m, fn(m), label, 'mesh', null); m.userData.sculpt = false; V.refreshAll(); return m; };
  api.mirror = (o, axis, cut) => modify(o, 'Spiegeln', m => F.geo.mirror(m.geometry, axisOf(axis), !!cut));
  api.array = (o, count, offset) => modify(o, 'Reihe', m => F.geo.array(m.geometry, Math.max(2, Math.min(60, count | 0 || 2)), vec(offset, [1, 0, 0])));
  api.shell = (o, t) => modify(o, 'Hohlkörper', m => F.geo.shell(m.geometry, +t || 0.02));
  api.subdivide = (o, kind) => modify(o, 'Unterteilen', m => kind === 'flat' ? F.geo.subdivideFlat(m.geometry) : F.geo.subdivideLoop(m.geometry));
  api.smooth = (o, iters, lam) => modify(o, 'Glätten', m => F.geo.smooth(m.geometry, iters || 2, lam || 0.5));
  api.decimate = (o, ratio) => modify(o, 'Vereinfachen', m => F.geo.decimate(m.geometry, clampR(ratio === undefined ? 0.5 : +ratio)));
  api.deform = (o, kind, amount) => modify(o, 'Verformen', m => { const g = F.geo.plain(m.geometry); F.geo.deform(g, kind, kind === 'taper' ? (+amount || 45) / 100 : +amount || 30); return g; });
  api.merge = (names, name) => { const l = (names || []).map(find); if (l.length < 2) throw new Error('Mindestens zwei Objekte nennen'); V.select(l[0]); l.slice(1).forEach(o => V.select(o, true)); UI.join(); if (name && S.active) S.active.name = V.uniqueName(String(name)); V.refreshAll(); return S.active; };
  api.scene = n => { const k = String(n || 'new'); if (k === 'new') { UI.clearScene(); } else if (k === 'demo') F.demo(); else if (k === 'rtw') F.demoAmbulance(); else if (k === 'city') { UI.clearScene(); F.map.sample(); UI.setMode('map'); } else if (k === 'rig') F.demoRig(); else if (k === 'scan') return F.demoScan(); else throw new Error('Szene: new, demo, rtw, city, rig oder scan'); return true; };
  api.edit = (o, c) => { const m = find(o), r = F.meshEdit(m, c || {}); F.say('Mesh: ' + r.info); return r.part || m; };
  /* Skulptur per Befehl: Pinselstriche an Weltpunkten ("at") oder auf der Oberfläche über (x,z) ("top") */
  api.sculpt = (o, s) => {
    s = s || {}; const m = find(o), K = F.sculpt; if (!K.ready(m)) throw new Error(F.say.last || 'Mesh lässt sich nicht skulptieren');
    const brush = s.brush || 'draw'; if (['draw', 'inflate', 'smooth', 'pinch', 'flatten'].indexOf(brush) < 0) throw new Error('Pinsel: draw, inflate, smooth, pinch oder flatten');
    const keep = { brush: K.brush, radius: K.radius, strength: K.strength, falloff: K.falloff, sym: K.sym, invert: K.invert, obj: K.obj };
    K.obj = m; K.brush = brush; K.radius = +s.radius || 0.3; K.strength = s.strength === undefined ? 0.5 : +s.strength; K.falloff = s.falloff || 'smooth'; K.sym = !!s.sym; K.invert = !!s.invert;
    m.updateMatrixWorld(true); const pts = [], list = v => v ? (Array.isArray(v[0]) ? v : [v]) : [];
    list(s.at).forEach(p => pts.push(new THREE.Vector3(+p[0], +p[1], +p[2])));
    list(s.top).forEach(p => { const h = new THREE.Raycaster(new THREE.Vector3(+p[0], 1000, +p[1]), new THREE.Vector3(0, -1, 0)).intersectObject(m, false)[0]; if (h) pts.push(h.point.clone()); });
    if (Array.isArray(s.line) && s.line.length > 1) for (let i = 0; i + 1 < s.line.length; i++) { const a = new THREE.Vector3(...s.line[i]), b = new THREE.Vector3(...s.line[i + 1]), n = Math.max(1, Math.ceil(a.distanceTo(b) / (K.radius * 0.25))); for (let k = 0; k <= n; k++) pts.push(a.clone().lerp(b, k / n)); }
    if (!pts.length) { Object.assign(K, keep); throw new Error('Sculpt: "at" [x,y,z], "top" [x,z] oder "line" angeben'); }
    const g = m.geometry, pos = g.attributes.position, old = Float32Array.from(pos.array), reps = Math.max(1, Math.min(40, (s.repeat | 0) || 1)), up = new THREE.Vector3(0, 1, 0);
    try { pts.forEach(pw => { const p = m.worldToLocal(pw.clone()); for (let r = 0; r < reps; r++) { K.dab(p, up); if (K.sym) { const pm = p.clone(); pm.x = -pm.x; K.dab(pm, up); } } }); }
    finally { Object.assign(K, keep); }
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox(); V.setPositionsUndo(m, old, Float32Array.from(pos.array), 'Skulptur'); V.refreshAll(); F.say('Skulptur: ' + pts.length + ' Punkt' + (pts.length === 1 ? '' : 'e') + ' × ' + reps); return m;
  };
  /* Textur per Befehl: Ebene füllen, Generator, Verlauf, Filter, Formen, Text, dann dem Objekt zuweisen */
  api.paint = (o, s) => {
    s = s || {}; const m = find(o), P = F.paint; V.select(m);
    const hasUV = g => { const u = g.attributes.uv; if (!u) return false; const n = Math.min(u.count, 4000); for (let i = 0; i < n; i++) if (u.getX(i) || u.getY(i)) return true; return false; };
    if (s.uv || !hasUV(m.geometry)) P.ensureUV(s.uv && s.uv !== true ? String(s.uv) : 'box');
    const slot = s.slot || 'map'; if (!P.SLOTS[slot]) throw new Error('Slot: ' + Object.keys(P.SLOTS).join(', '));
    if (s.size && !P.docs[slot]) P.size = Math.max(64, Math.min(4096, s.size | 0));
    P.slot = slot; const d = P.doc(slot), W = d.size, keepC = [P.color, P.color2];
    try {
      if (s.color) P.color = String(s.color); if (s.color2) P.color2 = String(s.color2);
      if (s.layer === 'new') P.layerOp('add');
      const l = P.layer(), hexOk = c => /^#[0-9a-f]{6}$/i.test(c);
      if (s.fill) { if (!hexOk(s.fill)) throw new Error('fill: Farbe als "#rrggbb"'); P.snap(); l.ctx.fillStyle = s.fill; l.ctx.fillRect(0, 0, W, W); }
      if (s.generate) { const g = typeof s.generate === 'string' ? { name: s.generate } : s.generate; if (!P.GENS[g.name]) throw new Error('Generator: ' + Object.keys(P.GENS).join(', ')); if (g.color) P.color = g.color; if (g.color2) P.color2 = g.color2; P.generate(g.name, g.a === undefined ? P.GENS[g.name].a[3] : +g.a); }
      if (s.gradient) { P.color = s.gradient[0]; P.color2 = s.gradient[1]; P.shape('gradient', { x: 0, y: 0 }, { x: 0, y: W }); }
      (s.filters || (s.filter ? [s.filter] : [])).forEach(f => { const g = typeof f === 'string' ? { name: f } : f; if (!P.FILTERS[g.name]) throw new Error('Filter: ' + Object.keys(P.FILTERS).join(', ')); const F0 = P.FILTERS[g.name]; P.applyFilter(g.name, g.a === undefined && F0.a ? F0.a[3] : g.a, g.b === undefined && F0.b ? F0.b[3] : g.b); });
      (s.shapes || []).forEach(sh => {
        if (sh.color) P.color = sh.color; const keepOp = P.brush.opacity, keepFill = P.fillShape; P.brush.opacity = sh.opacity === undefined ? 1 : +sh.opacity; P.fillShape = sh.stroke ? false : true; if (sh.width) P.brush.size = (+sh.width - 1) * 4;
        try { if (sh.rect) P.shape('rect', { x: +sh.rect[0], y: +sh.rect[1] }, { x: +sh.rect[2], y: +sh.rect[3] }); else if (sh.ellipse) P.shape('ellipse', { x: +sh.ellipse[0], y: +sh.ellipse[1] }, { x: +sh.ellipse[2], y: +sh.ellipse[3] }); else if (sh.line) P.shape('line', { x: +sh.line[0], y: +sh.line[1] }, { x: +sh.line[2], y: +sh.line[3] }); } finally { P.brush.opacity = keepOp; P.fillShape = keepFill; }
      });
      (s.texts || (s.text ? [s.text] : [])).forEach(t => {
        P.snap(); const c = P.layer().ctx; c.save(); c.fillStyle = t.color || P.color; c.font = (t.bold === false ? '' : 'bold ') + Math.round(+t.size || W / 8) + 'px ' + (t.font || 'sans-serif'); c.textAlign = t.align || 'center'; c.textBaseline = 'middle';
        if (t.rotate) { c.translate(+t.x, +t.y); c.rotate(t.rotate * DEG); c.fillText(String(t.text), 0, 0); } else c.fillText(String(t.text), +t.x, +t.y); c.restore(); P.compose();
      });
    } finally { P.color = keepC[0]; P.color2 = keepC[1]; }
    P.assign(slot, true); if (s.rough !== undefined) m.material.roughness = +s.rough; if (s.metal !== undefined) m.material.metalness = +s.metal; m.material.needsUpdate = true;
    V.refreshAll(); F.say('Textur (' + P.SLOTS[slot] + ') auf ' + m.name); return m;
  };
  /* Rigging per Befehl: Vorlage oder eigene Knochen, Binden, Pose, Keys, Abspielen */
  api.rig = s => {
    s = s || {}; const RG = F.rig, q = new THREE.Quaternion(), e = new THREE.Euler();
    const bone = n => { const b = RG.bones.find(x => x.name === n) || RG.bones.find(x => x.name.toLowerCase() === String(n).toLowerCase()); if (!b) throw new Error('Knochen nicht gefunden: ' + n + ' (vorhanden: ' + RG.bones.map(x => x.name).join(', ') + ')'); return b; };
    const applyPose = pz => { RG.resetPose(); Object.keys(pz || {}).forEach(n => { const b = bone(n), r = RG.rest.get(b) || { q: new THREE.Quaternion() }, v = pz[n]; e.set(v[0] * DEG, v[1] * DEG, v[2] * DEG); q.setFromEuler(e); b.quaternion.copy(r.q).multiply(q); }); RG.root.updateMatrixWorld(true); V.requestRender(); };
    if (s.clear) RG.clearAll();
    if (s.preset) { if (['humanoid', 'arm', 'chain'].indexOf(s.preset) < 0) throw new Error('Vorlage: humanoid, arm oder chain'); RG.preset(s.preset, s.n); }
    if (Array.isArray(s.bones)) {
      if (RG.skeleton) RG.unbind(true); if (s.replace) RG.clearAll(); RG.setMode('edit'); const by = {}; RG.bones.forEach(b => by[b.name] = b);
      s.bones.forEach(d => { const par = d.parent ? by[d.parent] : null; if (d.parent && !par) throw new Error('Eltern-Knochen nicht gefunden: ' + d.parent); by[d.name] = RG.addBone(d.name, new THREE.Vector3(...vec(d.pos, [0, 0, 0])), par); });
      RG.saveRest(); RG.select(RG.bones[0]);
    }
    if (s.bind !== undefined) { const sm = RG.bind(find(s.bind), s.sharp); if (!sm) throw new Error(F.say.last || 'Binden fehlgeschlagen'); }
    if (s.unbind) RG.unbind();
    if (s.pose) { RG.setMode('pose'); applyPose(s.pose); }
    if (s.reset) RG.resetPose();
    if (s.duration) RG.duration = Math.max(0.1, +s.duration);
    if (s.loop !== undefined) RG.loop = !!s.loop;
    if (Array.isArray(s.keys)) { if (!RG.bones.length) throw new Error('Keine Knochen vorhanden'); RG.setMode('pose'); RG.keys = []; s.keys.forEach(k => { applyPose(k.pose); RG.setKey(+k.t || 0); }); RG.seek(0); }
    if (s.time !== undefined) RG.seek(+s.time);
    if (s.play !== undefined) RG.play(!!s.play);
    V.refreshAll(); F.say('Rig: ' + RG.bones.length + ' Knochen, ' + RG.keys.length + ' Key' + (RG.keys.length === 1 ? '' : 's') + (RG.skeleton ? ', gebunden' : '')); return RG.bones.map(b => b.name);
  };
  api.screenshot = () => V.screenshot();
  api.photo = { simulate: (n, elev, f35) => F.photo.addSimulated({ n: n || 24, elev: elev === undefined ? 22 : elev, f35: f35 || 30 }), build: o => { Object.assign(F.photo.cfg, o || {}); return F.photo.build(); }, clear: () => F.photo.clear() };
  api.view = n => V.viewDir(n); api.frame = () => V.frame();
  api.place = place;
  return api;
})();

/* JSON-Befehle (ein Objekt oder ein Array) */
F.cmd = function (list) {
  const api = F.api; if (!Array.isArray(list)) list = [list]; let n = 0;
  list.forEach((c, i) => {
    try {
      if (c.edit) api.edit(c.edit, c);
      else if (c.sculpt) api.sculpt(c.sculpt, c);
      else if (c.paint) api.paint(c.paint, c);
      else if (c.rig) api.rig(c.rig === true ? {} : c.rig);
      else if (c.add) api.add(c.add, c);
      else if (c.boolean) api.subtract && F.boolean(c.boolean, api.find(c.a), api.find(c.b), !!c.keep, c.name);
      else if (c.set) { const m = api.find(c.set); api.place(m, c); V.refreshAll(); }
      else if (c.delete) api.remove(c.delete);
      else if (c.extrude) api.extrude(c.extrude.points, c.extrude.depth, c.extrude);
      else if (c.lathe) api.lathe(c.lathe.points, c.lathe.segments, c.lathe);
      else if (c.map) api.map(c.map);
      else if (c.mirror) api.mirror(c.mirror, c.axis, c.cut);
      else if (c.array) api.array(c.array, c.count, c.offset);
      else if (c.shell) api.shell(c.shell, c.thickness);
      else if (c.subdivide) api.subdivide(c.subdivide, c.kind);
      else if (c.smooth) api.smooth(c.smooth, c.iterations, c.lambda);
      else if (c.decimate) api.decimate(c.decimate, c.ratio);
      else if (c.deform) api.deform(c.deform, c.kind, c.amount);
      else if (c.merge) api.merge(c.merge, c.name);
      else if (c.scene) api.scene(c.scene);
      else if (c.photo) { const q = c.photo; Promise.resolve().then(async () => { if (q.simulate) await api.photo.simulate(q.simulate === true ? 24 : q.simulate, q.elev, q.f35); if (q.build) await api.photo.build(q.options); }).catch(e => F.say(e.message, 'err')); }
      else if (c.clear) api.clear();
      else if (c.view) api.view(c.view);
      else if (c.mode) UI.setMode(c.mode);
      else if (c.export) { exp.fmt = c.export; UI.setMode('code'); UI.genExport(); }
      else throw new Error('Unbekannter Befehl');
      n++;
    } catch (e) { throw new Error('Befehl ' + (i + 1) + ': ' + e.message); }
  });
  V.frame(); return n;
};
F.run = function (src) {
  src = String(src || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim(); if (!src) return F.say('Nichts zum Ausführen', 'err');
  try {
    F.group('Skript', () => {
      if (src[0] === '[' || src[0] === '{') { let j = null; try { j = JSON.parse(src); } catch (e) { j = null; } if (j) { const n = F.cmd(j); F.say(n + ' Befehl' + (n === 1 ? '' : 'e') + ' ausgeführt'); return; } }
      let fn; try { fn = new Function(...Object.keys(F.api), src); } catch (e) { throw new Error(e instanceof EvalError || /unsafe-eval|Content Security|blocked/i.test(e.message) ? 'Skripte sind in diesem Fenster gesperrt – bitte JSON-Befehle verwenden' : 'Syntaxfehler: ' + e.message); }
      fn(...Object.values(F.api)); V.frame(); F.say('Skript ausgeführt');
    });
  } catch (e) { F.say(e.message, 'err'); }
};
F.llmPrompt = function () {
  const kinds = Object.keys(F.prims).map(k => k + '(' + Object.keys(F.prims[k].p).join(', ') + ')').join('; ');
  return 'Du steuerst einen 3D-Editor („Formwerk 3D“) mit JSON-Befehlen. Antworte nur mit einem JSON-Array in einem Codeblock, ohne weiteren Text.\n' +
    'Einheiten: Meter, Y ist oben. „pos“ ist der Mittelpunkt des Objekts (ohne pos steht es auf dem Boden). Winkel in Grad. Farben als "#rrggbb".\n\n' +
    'Körper (Parameter in Metern): ' + kinds + '\n\n' +
    'Befehle:\n' +
    '{"add":"box","w":2,"h":1,"d":1,"pos":[0,0.5,0],"rot":[0,0,0],"scale":1,"color":"#c47d6d","name":"Sockel"}\n' +
    '{"boolean":"subtract","a":"Sockel","b":"Bohrung","name":"Lager","keep":false}   // union | subtract | intersect\n' +
    '{"set":"Sockel","pos":[1,0.5,0],"rot":[0,45,0],"scale":[1,2,1],"color":"#ffffff"}\n' +
    '{"delete":"Sockel"}\n' +
    '{"extrude":{"points":[[0,0],[2,0],[2,1],[0,1]],"depth":0.5,"plane":"xz","bevel":0.02,"holes":[],"name":"Platte"}}   // Skizze → Körper; xz = liegender Grundriss\n' +
    '{"lathe":{"points":[[0.5,0],[0.6,0.5],[0.3,1.0]],"segments":48,"name":"Vase"}}   // Profil (Radius, Höhe) wird gedreht\n' +
    '{"map": { …GeoJSON oder Overpass-JSON… }}   // Gebäude, Straßen, Wasser, Grün\n' +
    '{"mirror":"Sockel","axis":"x","cut":false}   {"array":"Zaun","count":6,"offset":[0.5,0,0]}   {"shell":"Kugel","thickness":0.03}   {"subdivide":"Block","kind":"loop"}   {"smooth":"Skulptur","iterations":2}   {"decimate":"Scan","ratio":0.3}   {"deform":"Turm","kind":"twist","amount":45}   // twist | taper | bend\n' +
    '{"edit":"Block","select":{"normal":[0,1,0],"tol":20},"op":"extrude","amount":0.3}   // Mesh-Bearbeitung. op: extrude | inset | fase | delete | separate | copy | move | scale | rotate | merge | loopcut. select: "all" oder {normal:[x,y,z], tol:Grad, axis:"y", min:0.9, max:1, rel:true, box:[[x0,y0,z0],[x1,y1,z1]]} (lokale Koordinaten, rel:true = Anteil 0..1 der Ausdehnung). Tasche: erst inset, dann extrude mit negativem amount. move/scale/rotate: "move":[x,y,z], "soft":Radius für weichen Abfall. loopcut: "axis":"y","count":3. separate/copy: "name"\n' +
    '{"sculpt":"Kugel","brush":"inflate","top":[0.2,0.1],"radius":0.4,"strength":0.6,"repeat":3}   // Pinsel draw | inflate | smooth | pinch | flatten an einem Weltpunkt "at":[x,y,z], einem Oberflächenpunkt über (x,z) "top":[x,z] oder entlang "line":[[x,y,z],[x,y,z]]; "invert":true, "sym":true. Das Netz braucht genug Dreiecke (vorher subdivide)\n' +
    '{"paint":"Wand","generate":{"name":"bricks","a":10,"color":"#8a3b2a","color2":"#d9d2c3"},"text":{"text":"RTW","x":512,"y":300,"size":120,"color":"#ffffff"}}   // Textur auf 1024 × 1024 Pixeln: fill "#rrggbb", generate checker | clouds | marble | wood | bricks | uv | ramp, gradient ["#..","#.."], filter noise | blur | invert | gray, shapes [{"rect":[x0,y0,x1,y1],"color":"#.."}] (auch ellipse, line), text; "slot":"map" | "roughnessMap" | "bumpMap"; UVs entstehen automatisch\n' +
    '{"rig":{"preset":"humanoid"}}  {"rig":{"bind":"Figur"}}  {"rig":{"keys":[{"t":0,"pose":{"UpperArm_L":[0,0,0]}},{"t":1,"pose":{"UpperArm_L":[0,0,70]}}],"duration":1,"play":true}}   // Knochen: preset humanoid | arm | chain, oder "bones":[{"name":"A","pos":[0,1,0]},{"name":"B","pos":[0,1.5,0],"parent":"A"}]; bind bindet ein Mesh mit Auto-Gewichten; Posen als Drehwinkel in Grad je Knochen; keys erzeugt eine Animation\n' +
    '{"merge":["Teil1","Teil2"],"name":"Gruppe"}   {"scene":"rtw"}   // new | demo | rtw (Rettungswagen, über 160.000 Dreiecke) | city | rig | scan (Foto-Scanner-Demo)\n' +
    '{"photo":{"simulate":24,"elev":22,"build":true}}   // Foto-Scanner: Testfotos aus der Szene rendern und daraus ein Modell rechnen\n' +
    '{"mode":"photo"}   // object | cad | edit | sculpt | paint | rig | map | photo | code\n' +
    '{"clear":true}   {"view":"iso"}   {"export":"unity"}   // unity | unreal | godot | cppgl | cpp | blender | threejs | obj | stl | gltf | glb\n\n' +
    'Beispiel: [{"add":"box","w":2,"h":0.8,"d":1.2,"pos":[0,0.4,0],"name":"Block"},{"add":"cylinder","rt":0.3,"rb":0.3,"h":2,"rot":[90,0,0],"pos":[0,0.4,0],"name":"Loch"},{"boolean":"subtract","a":"Block","b":"Loch","name":"Lagerblock"}]\n\n' +
    'Aufgabe: ';
};


/* ---------- Gesamtanleitung für Sprachmodelle ---------- */
F.manual = function () {
  return F.llmPrompt() + '\n\n' +
    '=== Formwerk 3D · Gesamtanleitung für KI-Assistenten ===\n' +
    'Was das ist: ein 3D-Editor in einer einzigen HTML-Seite (läuft im Browser, im Chat-Fenster, ohne Server). Er kann CAD (Boolesche Operationen mit der Manifold-Engine – robust auch bei 100.000+ Dreiecken, Farben/Texturen bleiben erhalten, Netze müssen wasserdicht sein; Skizze → Extrusion/Drehung), Mesh-Bearbeitung, Sculpting, Textur-Studio, Rigging, Karten → 3D, Fotoscanner, Import und Export.\n' +
    'So steuerst du ihn:\n' +
    '1. Der Nutzer fügt deine JSON-Befehle (siehe oben) im Modus „Export“ unter „Skript & Befehle“ ein und drückt „Ausführen“. Das geht auch ohne Skripte, wenn das Chat-Fenster Skripte sperrt.\n' +
    '2. Hast du Zugriff auf die Seite (Browser-Werkzeug), rufst du direkt auf: Formwerk3D.run(\'[{"add":"box","w":2,"h":1,"d":1}]\') oder Formwerk3D.cmd([...]) oder die API Formwerk3D.api.box({...}), .subtract(a,b), .mirror(o,"x"), .array(o,5,[1,0,0]), .decimate(o,0.3), .scene("rtw"), .screenshot().\n' +
    '3. Zum Zeigen im Chat: {"view":"iso"} und danach der Knopf „Bild“ (oben) – er erzeugt ein Bild der Ansicht zum Kopieren oder Speichern. Formwerk3D.api.screenshot() liefert dieselbe Grafik als Data-URL.\n\n' +
    'Import (Knopf „Importieren“, oder Dateien ins Fenster ziehen): GLB, glTF, VRM, FBX, OBJ (+MTL, Texturen), DAE, 3DS, 3MF, STL, PLY, ZIP (mit Texturen), Punktwolken (XYZ, PTS, CSV, PCD, LAS), Gaussian Splats (.splat, 3DGS-PLY). Wolken und Splats lassen sich unter „Export → Importieren“ per „In Netz wandeln“ in ein Dreiecksnetz umwandeln. Mehrere Fotos (JPG, PNG, WebP) öffnen den Fotomodus.\n' +
    'Fotomodus (Modus „Foto“): 16 bis 40 Fotos rund um ein Objekt auf einfarbigem Untergrund, der Reihe nach benannt. Der Browser bestimmt Maske, Kamerahöhe und Brennweite, rechnet daraus die Hülle (Sichtkörper) und legt die Fotos als Textur darüber. Alles lokal. Grenzen: keine Mulden/Hohlräume, kein Glas, keine Räume. Ohne eigene Fotos: „Testaufnahmen aus der Szene“ oder Szene „Demo: Foto-Scanner“.\n' +
    'Karten: Modus „Karte“ mit GeoJSON oder Overpass-JSON (Gebäude, Straßen, Wasser, Grün) und optionaler Höhenkarte als Bild → Gelände.\n' +
    'Rigging: Knochen bauen, Auto-Gewichte, Pose/Animation, Keys; Export als glTF/Unity/Unreal/Godot/Blender. Per Befehl: {"rig":{...}} (siehe oben), danach {"mode":"rig"} und „Bild“.\n' +
    'Mesh-Bearbeitung, Skulptur und Textur laufen ebenfalls per Befehl (edit, sculpt, paint). Typischer Ablauf für ein Teil: Körper anlegen, Fläche wählen und extrudieren/einsetzen, Kantenschleife einfügen, Details skulptieren, Textur erzeugen, dann Bild zeigen und exportieren.\n' +
    'Export: Modus „Export“ → Format (Unity C#, Unreal C++, Godot, C++/OpenGL, C++ Array, Blender-Python, three.js, OBJ, STL, glTF, GLB) → „Erzeugen“ → „Kopieren“ (oder „Als Datei“, wenn Downloads erlaubt sind).\n' +
    'Einheiten: 1 Einheit = 1 Meter, Y oben, rechtshändig. Die Szene lässt sich als JSON sichern („Szene als JSON“) und laden.\n' +
    'Beispiele zum Vorführen: {"scene":"rtw"} (Rettungswagen, über 160.000 Dreiecke), {"scene":"city"} (Stadt aus Kartendaten), {"scene":"scan"} (Foto-Scanner-Demo), {"scene":"rig"} (animierte Kette).\n';
};
F.snapshotView = function () {
  const url = V.screenshot(), box = $('#help'); if (!box) return url; box.textContent = '';
  const img = h('img', { src: url, alt: 'Ansicht', style: 'max-width:100%;height:auto;border-radius:8px;display:block' });
  const copy = async () => { try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); const blob = await new Promise(r => c.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); F.say('Bild kopiert'); } catch (e) { F.say('Kopieren geht hier nicht – Bild lange drücken oder rechte Maustaste', 'err'); } };
  box.append(h('div', { class: 'box', role: 'dialog', 'aria-label': 'Bild' }, h('div', { class: 'row' }, h('h2', { class: 'grow', text: 'Bild der Ansicht' }), btn('Schließen', () => UI.help(false), { cls: 'sm' })), img,
    h('p', { class: 'hint', text: 'Zum Speichern lange drücken oder rechte Maustaste → „Bild speichern“. In manchen Chat-Fenstern sind Downloads gesperrt.' }), row(btn('Bild kopieren', copy, { cls: 'sm pri' }))));
  box.hidden = false; return url;
};
/* ---------- Scanner-Demo: Rettungswagen → Fotos → Modell, nebeneinander ---------- */
F.demoScan = async function () {
  const P = F.photo, keep = P.cfg.size; UI.clearScene(); P.clear();
  F.group('Scanner-Demo', () => { F.vehicle.add({ detail: 0.06 }); });
  V.viewDir('iso'); V.frame(); await F.vox.tick();
  F.say('Testfotos werden gerendert …', '', true); await P.addSimulated({ n: 20, elev: 24, f35: 28, w: 800, h: 600 });
  P.cfg.size = 5.4; P.cfg.res = 128; P.cfg.tex = true;
  const orig = V.objects().filter(o => /^RTW /.test(o.name)); let m;
  try { m = await P.build(); } finally { P.cfg.size = keep; }
  if (!m) throw new Error(F.say.last || 'Rekonstruktion fehlgeschlagen');
  m.position.x = 4.6; UI.setMode('object'); V.select(m); V.refreshAll(); V.viewDir('iso'); V.frame();
  F.say('Links das Original (' + orig.length + ' Teile), rechts das Modell, das der Browser aus 20 Fotos berechnet hat (' + F.geo.stats(m.geometry).tris.toLocaleString('de-DE') + ' Dreiecke).');
  return m;
};

/* ---------- Beispiele ---------- */
F.demo = function () {
  UI.clearScene(); const api = F.api;
  F.group('Beispielszene', () => {
    const block = api.box({ w: 2.4, h: 0.8, d: 1.2, pos: [0, 0.4, 0], color: '#8fa3bf', name: 'Block' });
    const bore = api.cylinder({ rt: 0.35, rb: 0.35, h: 1.6, seg: 48, pos: [0, 0.4, 0], rot: [90, 0, 0], name: 'Bohrung' });
    const lager = api.subtract(block, bore, { name: 'Lagerblock' });
    api.gear({ teeth: 18, ro: 0.6, ri: 0.5, thick: 0.18, hole: 0.14, pos: [2.5, 0.6, 0], rot: [90, 0, 0], color: '#c9a66b', name: 'Zahnrad' });
    api.icosphere({ r: 0.7, detail: 4, pos: [-2.4, 0.7, 0], color: '#c47d6d', name: 'Skulptur-Kugel' });
    V.select(lager);
  });
  V.frame(); F.say('Beispiel: Lagerblock (Box minus Zylinder), Zahnrad und Kugel zum Sculpten');
};
F.demoRig = function () {
  UI.clearScene(); const RG = F.rig;
  const g = new THREE.CylinderGeometry(0.22, 0.14, 1.5, 20, 30); const m = F.api.place(V.addMesh(g, { name: 'Schlange', kind: 'mesh', position: [0, 0.75, 0], dropToGrid: false, color: new THREE.Color('#7fb59a') }), {});
  RG.preset('chain', 6); RG.bind(m, 3); RG.setMode('pose'); RG.saveRest();
  RG.setKey(0); RG.bones.forEach((b, i) => { if (i > 0 && i < RG.bones.length - 1) b.rotation.z = 0.32; }); RG.root.updateMatrixWorld(true); RG.setKey(1);
  RG.bones.forEach((b, i) => { if (i > 0 && i < RG.bones.length - 1) b.rotation.z = -0.32; }); RG.root.updateMatrixWorld(true); RG.setKey(2); RG.duration = 2; RG.seek(0);
  UI.setMode('rig'); V.frame(); F.say('Beispiel: Kette aus 7 Knochen, Mesh gebunden, Animation mit 3 Keys. „Abspielen“ klicken.');
};

/* ---------- Hilfe ---------- */
UI.help = function (on) {
  const box = $('#help'); if (!box) return;
  if (!on) { box.hidden = true; return; }
  box.textContent = '';
  const li = (...k) => h('li', null, ...k), kbd = t => h('kbd', { text: t });
  box.append(h('div', { class: 'box', role: 'dialog', 'aria-label': 'Hilfe' },
    h('div', { class: 'row' }, h('h2', { class: 'grow', text: 'Formwerk 3D – Kurzanleitung' }), btn('Schließen', () => UI.help(false), { cls: 'sm' })),
    h('p', { class: 'hint', text: 'Ein Fenster für CAD, Mesh-Formen, Sculpting, Texturen, Rigging und Kartenmodelle. Alles läuft lokal im Browser; es werden nur die 3D-Bibliotheken geladen.' }),
    h('h3', { text: 'Ansicht' }),
    h('ul', null, li('Ziehen = drehen · rechte Maustaste = verschieben · Rad = zoomen. Am Handy: ein Finger drehen, zwei Finger schieben und zoomen.'), li('Obere Leiste im Fenster: Ansichten, Ortho, Darstellung. ', kbd('F'), ' fokussiert die Auswahl, ', kbd('Home'), ' zeigt alles, ', kbd('1'), ' ', kbd('3'), ' ', kbd('7'), ' Vorne/Rechts/Oben (mit ', kbd('Strg'), ' hinten/links/unten), ', kbd('5'), ' Ortho.')),
    h('h3', { text: 'Tasten' }),
    h('div', { class: 'cols' }, h('ul', null, li(kbd('G'), ' ', kbd('R'), ' ', kbd('S'), ' Bewegen, Drehen, Skalieren'), li(kbd('Strg+Z'), ' / ', kbd('Strg+Y'), ' Rückgängig / Wiederholen'), li(kbd('Strg+D'), ' Duplizieren'), li(kbd('Entf'), ' Löschen')), h('ul', null, li(kbd('Tab'), ' Objekt ↔ Mesh-Bearbeitung'), li(kbd('A'), ' alles wählen · ', kbd('Alt+A'), ' nichts'), li(kbd('Leertaste'), ' Animation abspielen (Rig)'), li(kbd('K'), ' Key setzen (Rig)'))),
    h('h3', { text: 'Typische Wege' }),
    h('ul', null,
      li(h('b', { text: 'CAD: ' }), 'Zwei Körper wählen → „A − B“ für ein Loch. Oder Skizze zeichnen → extrudieren oder drehen.'),
      li(h('b', { text: 'Mesh: ' }), 'Modus „Mesh“ → Röntgen an → Rahmen um die Punkte einer Fläche ziehen → „Extrudieren“, „Einsetzen“ oder „Fase“. Für eine Tasche erst „Einsetzen“, dann negativ extrudieren. „Kantenschleife“ teilt das Netz an einer Ebene.'),
      li(h('b', { text: 'Per KI-Befehl: ' }), 'Dieselben Werkzeuge gibt es als JSON-Befehle (edit, sculpt, paint, rig). Knopf „Anleitung für Sprachmodell kopieren“ weiter unten in dieser Hilfe.'),
      li(h('b', { text: 'Sculpt: ' }), 'Kugel wählen → Modus „Sculpt“ → Pinsel ziehen. Vorher „Unterteilen“.'),
      li(h('b', { text: 'Textur: ' }), 'Objekt wählen → Modus „Textur“ → „Dem Objekt zuweisen“ → direkt am Modell malen.'),
      li(h('b', { text: 'Rig: ' }), 'Vorlage „Mensch“ oder „Kette“ → Objekt wählen → „Binden“ → Knochen drehen → Keys setzen.'),
      li(h('b', { text: 'Karte: ' }), 'GeoJSON oder Overpass-JSON einfügen → „Karte → 3D“. Höhenkarte als Bild für Gelände.'),
      li(h('b', { text: 'Engine: ' }), 'Modus „Export“ → Format wählen → Kopieren und in Unity, Unreal, Godot, Blender oder ein C++-Projekt einfügen.')),
    h('h3', { text: 'Importieren, Fotos, Bild' }),
    h('ul', null,
      li(h('b', { text: 'Import: ' }), '„Importieren“ oben oder Dateien ins Fenster ziehen: GLB, glTF, VRM, FBX, OBJ, DAE, 3DS, 3MF, STL, PLY, ZIP, Punktwolken (XYZ, PTS, PCD, LAS) und Gaussian Splats.'),
      li(h('b', { text: 'Foto-Scanner: ' }), 'Modus „Foto“. 16 bis 40 Fotos rund um ein Objekt auf einfarbigem Untergrund laden, „Modell berechnen“. Ohne Fotos: „Szene … → Demo: Foto-Scanner“.'),
      li(h('b', { text: 'Bild: ' }), 'Der Knopf „Bild“ oben erzeugt ein Bild der Ansicht zum Kopieren oder Speichern.'),
      li(h('b', { text: 'Vereinfachen: ' }), 'Objekt wählen → CAD → „Vereinfachen“ reduziert die Dreiecke (für Spiele und Scans).')),
    h('h3', { text: 'Im Chat mit Sprachmodellen' }),
    h('p', { class: 'hint', text: 'Einige Chat-Fenster sperren Downloads und Skripte. Darum gibt es überall „Kopieren“. Mit „Befehle für Sprachmodell kopieren“ (Export → Skript & Befehle) bekommt ein Modell die Syntax und kann dir fertige JSON-Befehle schreiben, die du dort wieder einfügst.' }),
    row(btn('Anleitung für Sprachmodell kopieren', () => F.copyText(F.llmPrompt(), 'Anleitung kopiert'), { cls: 'sm pri' }), btn('Komplette KI-Anleitung', () => F.copyText(F.manual(), 'KI-Anleitung kopiert'), { cls: 'sm' }))));
  box.hidden = false;
};

/* ---------- Tastatur ---------- */
UI.keys = function () {
  window.addEventListener('keydown', e => {
    const t = e.target, tag = t && t.tagName; if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (t && t.isContentEditable)) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, lk = k.length === 1 ? k.toLowerCase() : k;
    if (k === 'Escape') { if (!$('#help').hidden) { UI.help(false); return; } if (S.mode === 'sculpt' || S.mode === 'edit') { UI.setMode('object'); return; } V.select(null); return; }
    if (ctrl && lk === 'z') { e.preventDefault(); e.shiftKey ? UI.redo() : UI.undo(); return; }
    if (ctrl && lk === 'y') { e.preventDefault(); UI.redo(); return; }
    if (ctrl && lk === 'd') { e.preventDefault(); if (V.objMode()) V.duplicate(); return; }
    if (ctrl) { if (lk === '1') { e.preventDefault(); V.viewDir('back'); } else if (lk === '3') { e.preventDefault(); V.viewDir('left'); } else if (lk === '7') { e.preventDefault(); V.viewDir('bottom'); } return; }
    if (k === 'Tab') { e.preventDefault(); UI.setMode(S.mode === 'edit' ? 'object' : 'edit'); return; }
    if (lk === 'g' || lk === 'r' || lk === 's') { if (V.objMode() || S.mode === 'rig') { if (S.mode === 'rig') { RG_.gizmo = lk === 'g' ? 'translate' : 'rotate'; RG_.attachGizmo(); } else V.setGizmo(lk === 'g' ? 'translate' : lk === 'r' ? 'rotate' : 'scale'); } return; }
    if (k === 'Delete' || k === 'Backspace' || lk === 'x') { if (V.objMode()) V.remove(); else if (S.mode === 'rig' && RG_.sel) RG_.remove(RG_.sel); return; }
    if (lk === 'f') { if (S.mode === 'rig' && RG_.sel) { V.frame(); } else V.focusSel(); return; }
    if (k === 'Home') { V.frame(); return; }
    if (lk === 'a') { if (e.altKey) { if (S.mode === 'edit') E_.selectNone(); else V.select(null); } else if (S.mode === 'edit') E_.selectAll(); else if (V.objMode()) V.objects().filter(o => o.visible).forEach((o, i) => V.select(o, i > 0)); return; }
    if (lk === '1') V.viewDir('front'); else if (lk === '3') V.viewDir('right'); else if (lk === '7') V.viewDir('top'); else if (lk === '5') V.setOrtho(!S.ortho);
    else if (k === ' ' && S.mode === 'rig') { e.preventDefault(); RG_.play(); UI.drawPanel(true); }
    else if (lk === 'k' && S.mode === 'rig') RG_.setKey(RG_.time);
  });
};
