/* ============================================================
   Mesh-Bearbeitung (Punkte), Skulptur-Pinsel, Messwerkzeug
   ============================================================ */
const G = F.geo;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m4 = new THREE.Matrix4();

/* gemeinsamer Trick: Drahtgitter als Kind-Mesh mit derselben Geometrie */
V.rebuildWire = function (mesh) {
  let w = mesh.userData.wire;
  if (S.shading !== 'solidwire') { if (w) { mesh.remove(w); mesh.userData.wire = null; } if (mesh.material) mesh.material.polygonOffset = false; return; }
  if (!w) {
    w = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--vp-wire')), wireframe: true, transparent: true, opacity: 0.5, depthWrite: false }));
    w.userData.helper = true; w.raycast = () => { }; mesh.add(w); mesh.userData.wire = w;
  }
  w.geometry = mesh.geometry;
  if (mesh.material) { mesh.material.polygonOffset = true; mesh.material.polygonOffsetFactor = 1; mesh.material.polygonOffsetUnits = 1; }
};

/* ===================== Punkt-Bearbeitung ===================== */
const E = F.edit = { obj: null, groups: [], sel: new Set(), pts: null, wire: null, pivot: new THREE.Object3D(), prop: { on: false, radius: 0.6 }, nav: false, xray: true, drag: null, start: null };
E.pivot.userData.gizmoTarget = 'pivot';

E.enter = function (obj) {
  if (!obj || !obj.isMesh || obj.isSkinnedMesh) { F.say('Bitte ein normales Mesh wählen (kein Rig-Mesh)', 'err'); return false; }
  E.leave();
  E.obj = obj; E.sel.clear();
  const pos = obj.geometry.attributes.position, map = new Map(), groups = [], q = 1e5;
  const map2 = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const key = Math.round(pos.getX(i) * q) + ',' + Math.round(pos.getY(i) * q) + ',' + Math.round(pos.getZ(i) * q);
    let gi = map.get(key); if (gi === undefined) { gi = groups.length; map.set(key, gi); groups.push({ idx: [] }); }
    groups[gi].idx.push(i); map2[i] = gi;
  }
  E.groups = groups; E.map = map2; E.nb = null;
  const n = groups.length, P = new Float32Array(n * 3), C = new Float32Array(n * 3);
  groups.forEach((g, i) => { const k = g.idx[0]; P[i * 3] = pos.getX(k); P[i * 3 + 1] = pos.getY(k); P[i * 3 + 2] = pos.getZ(k); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  E.pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: !E.xray, transparent: true }));
  E.pts.userData.helper = true; E.pts.raycast = () => { }; E.pts.renderOrder = 10; E.pts.frustumCulled = false; obj.add(E.pts);
  obj.userData.prevShading = S.shading; if (S.shading === 'solid') V.setShading('solidwire');
  E.colorPts(); V.refreshAll(); return true;
};
E.leave = function () {
  if (!E.obj) return;
  E.obj.remove(E.pts); E.pts.geometry.dispose(); E.pts = null;
  if (E.obj.userData.prevShading === 'solid' && S.shading === 'solidwire') V.setShading('solid');
  E.obj = null; E.sel.clear();
  if (V.tc.object === E.pivot) V.tc.detach();
  V.refreshAll();
};
E.gizmoActive = () => !!(E.obj && E.sel.size);
E.colorPts = function () {
  if (!E.pts) return; const c = E.pts.geometry.attributes.color, a = new THREE.Color('#ffa630'), b = new THREE.Color(cssVar('--vp-pt'));
  for (let i = 0; i < E.groups.length; i++) { const col = E.sel.has(i) ? a : b; c.setXYZ(i, col.r, col.g, col.b); }
  c.needsUpdate = true; E.pts.material.depthTest = !E.xray; E.pts.material.needsUpdate = true;
  E.placePivot(); V.requestRender();
  F.ui && F.ui.refreshEdit && F.ui.refreshEdit();
};
E.refreshPoints = function () {
  if (!E.pts) return; const pos = E.obj.geometry.attributes.position, P = E.pts.geometry.attributes.position;
  E.groups.forEach((g, i) => { const k = g.idx[0]; P.setXYZ(i, pos.getX(k), pos.getY(k), pos.getZ(k)); }); P.needsUpdate = true; E.placePivot();
};
E.placePivot = function () {
  if (!E.obj) return;
  if (!E.sel.size) { if (V.tc.object === E.pivot) V.tc.detach(); return; }
  const pos = E.obj.geometry.attributes.position, c = new THREE.Vector3();
  E.sel.forEach(i => { const k = E.groups[i].idx[0]; c.add(_v.set(pos.getX(k), pos.getY(k), pos.getZ(k))); });
  c.divideScalar(E.sel.size); E.obj.localToWorld(c);
  E.pivot.position.copy(c); E.pivot.quaternion.identity(); E.pivot.scale.set(1, 1, 1); E.pivot.updateMatrixWorld(true);
  if (!E.pivot.parent) V.overlay.add(E.pivot);
  V.tc.attach(E.pivot); V.tc.setMode(S.gizmo); V.tc.visible = true;
};
E.neighbors = function () {
  if (E.nb) return E.nb;
  const g = E.obj.geometry, idx = g.index, cnt = idx ? idx.count : g.attributes.position.count, nb = E.groups.map(() => new Set());
  for (let i = 0; i + 2 < cnt; i += 3) {
    const a = E.map[idx ? idx.getX(i) : i], b = E.map[idx ? idx.getX(i + 1) : i + 1], c = E.map[idx ? idx.getX(i + 2) : i + 2];
    nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
  }
  return (E.nb = nb);
};
E.selKeys = function () { const pos = E.obj.geometry.attributes.position, s = new Set(), key = F.meshops.key; E.sel.forEach(i => { const k = E.groups[i].idx[0]; s.add(key(pos.getX(k), pos.getY(k), pos.getZ(k))); }); return s; };
E.selectKeys = function (keys) { const pos = E.obj.geometry.attributes.position, key = F.meshops.key; E.sel.clear(); E.groups.forEach((g, i) => { const k = g.idx[0]; if (keys.has(key(pos.getX(k), pos.getY(k), pos.getZ(k)))) E.sel.add(i); }); E.colorPts(); };
E.selectAll = () => { for (let i = 0; i < E.groups.length; i++) E.sel.add(i); E.colorPts(); };
E.selectNone = () => { E.sel.clear(); E.colorPts(); };
E.invert = () => { const n = new Set(); for (let i = 0; i < E.groups.length; i++) if (!E.sel.has(i)) n.add(i); E.sel = n; E.colorPts(); };
E.grow = () => { const nb = E.neighbors(), add = []; E.sel.forEach(i => nb[i].forEach(j => add.push(j))); add.forEach(j => E.sel.add(j)); E.colorPts(); };
E.selectIn = function (x0, y0, x1, y1, add) {
  if (!add) E.sel.clear();
  const r = V.dom.getBoundingClientRect(), pos = E.obj.geometry.attributes.position, m = E.obj.matrixWorld;
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1), single = (xb - xa < 5 && yb - ya < 5);
  let best = -1, bd = 14 * 14;
  E.groups.forEach((g, i) => {
    const k = g.idx[0]; _v.set(pos.getX(k), pos.getY(k), pos.getZ(k)).applyMatrix4(m).project(V.cam);
    if (_v.z > 1) return;
    const sx = (_v.x * 0.5 + 0.5) * r.width + r.left, sy = (-_v.y * 0.5 + 0.5) * r.height + r.top;
    if (single) { const d = (sx - x0) * (sx - x0) + (sy - y0) * (sy - y0); if (d < bd) { bd = d; best = i; } }
    else if (sx >= xa && sx <= xb && sy >= ya && sy <= yb) E.sel.add(i);
  });
  if (single && best >= 0) { if (add && E.sel.has(best)) E.sel.delete(best); else E.sel.add(best); }
  E.colorPts();
};
E.weights = function () { // weiche Auswahl
  const pos = E.obj.geometry.attributes.position, w = new Float32Array(E.groups.length), R = E.prop.radius / Math.max(1e-6, (Math.abs(E.obj.scale.x) + Math.abs(E.obj.scale.y) + Math.abs(E.obj.scale.z)) / 3);
  const sp = []; E.sel.forEach(i => { const k = E.groups[i].idx[0]; sp.push(pos.getX(k), pos.getY(k), pos.getZ(k)); });
  const nSel = sp.length / 3, stride = (nSel * E.groups.length > 4e6) ? Math.ceil(nSel * E.groups.length / 4e6) : 1;
  E.groups.forEach((g, i) => {
    if (E.sel.has(i)) { w[i] = 1; return; }
    if (!E.prop.on) return;
    const k = g.idx[0], x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k); let d2 = Infinity;
    for (let s = 0; s < nSel; s += stride) { const dx = sp[s * 3] - x, dy = sp[s * 3 + 1] - y, dz = sp[s * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < d2) d2 = d; }
    const t = Math.sqrt(d2) / R; if (t < 1) w[i] = (1 - t * t) * (1 - t * t);
  });
  return w;
};
E.begin = function () { // vor Gizmo-Zug
  if (!E.obj || !E.sel.size) return;
  const pos = E.obj.geometry.attributes.position;
  E.start = { all: Float32Array.from(pos.array), w: E.weights(), M0: E.pivot.matrixWorld.clone() };
};
E.apply = function () {
  if (!E.start || !E.obj) return;
  E.pivot.updateMatrixWorld(true);
  const D = new THREE.Matrix4().multiplyMatrices(E.pivot.matrixWorld, E.start.M0.clone().invert());
  const inv = E.obj.matrixWorld.clone().invert(), pos = E.obj.geometry.attributes.position, st = E.start.all, w = E.start.w;
  E.groups.forEach((g, i) => {
    const wi = w[i]; if (!wi) return; const k = g.idx[0];
    _v.set(st[k * 3], st[k * 3 + 1], st[k * 3 + 2]); _w.copy(_v).applyMatrix4(E.obj.matrixWorld).applyMatrix4(D).applyMatrix4(inv);
    _v.lerp(_w, wi);
    for (const j of g.idx) pos.setXYZ(j, _v.x, _v.y, _v.z);
  });
  pos.needsUpdate = true; E.obj.geometry.computeVertexNormals(); E.refreshPointsKeep();
};
E.refreshPointsKeep = function () { // Punkte aktualisieren, ohne den Pivot zu verschieben
  const pos = E.obj.geometry.attributes.position, P = E.pts.geometry.attributes.position;
  E.groups.forEach((g, i) => { const k = g.idx[0]; P.setXYZ(i, pos.getX(k), pos.getY(k), pos.getZ(k)); }); P.needsUpdate = true; V.requestRender();
};
E.finish = function () {
  if (!E.start || !E.obj) return; const old = E.start.all, now = Float32Array.from(E.obj.geometry.attributes.position.array); E.start = null;
  let same = true; for (let i = 0; i < old.length; i++) if (old[i] !== now[i]) { same = false; break; }
  if (same) return;
  E.obj.geometry.computeBoundingSphere(); E.obj.geometry.computeBoundingBox();
  V.setPositionsUndo(E.obj, old, now, 'Punkte bewegen'); E.placePivot();
};
/* direkte Operationen auf der Auswahl */
E.nudge = function (amount) {
  if (!E.sel.size) return F.say('Zuerst Punkte auswählen', 'err');
  E.begin(); const g = E.obj.geometry, pos = g.attributes.position, nor = g.attributes.normal, w = E.start.w;
  E.groups.forEach((gr, i) => {
    if (!w[i]) return; const k = gr.idx[0], f = amount * w[i];
    const x = pos.getX(k) + nor.getX(k) * f, y = pos.getY(k) + nor.getY(k) * f, z = pos.getZ(k) + nor.getZ(k) * f;
    for (const j of gr.idx) pos.setXYZ(j, x, y, z);
  });
  pos.needsUpdate = true; g.computeVertexNormals(); E.refreshPointsKeep(); E.finish();
};
E.smoothSel = function (iter) {
  if (!E.sel.size) return F.say('Zuerst Punkte auswählen', 'err');
  E.begin(); const nb = E.neighbors(), pos = E.obj.geometry.attributes.position, w = E.start.w;
  for (let it = 0; it < iter; it++) {
    const np = new Map();
    E.sel.forEach(i => { const s = nb[i]; if (!s.size) return; let x = 0, y = 0, z = 0; s.forEach(j => { const k = E.groups[j].idx[0]; x += pos.getX(k); y += pos.getY(k); z += pos.getZ(k); }); const k = E.groups[i].idx[0]; np.set(i, [pos.getX(k) + (x / s.size - pos.getX(k)) * 0.5, pos.getY(k) + (y / s.size - pos.getY(k)) * 0.5, pos.getZ(k) + (z / s.size - pos.getZ(k)) * 0.5]); });
    np.forEach((p, i) => E.groups[i].idx.forEach(j => pos.setXYZ(j, p[0], p[1], p[2])));
  }
  pos.needsUpdate = true; E.obj.geometry.computeVertexNormals(); E.refreshPointsKeep(); E.finish();
};
/* Werkzeug: Auswahl per Klick / Rahmen */
F.tools.vertex = {
  cursor: 'crosshair',
  enter() { }, leave() { },
  down(e) {
    if (!E.obj || E.nav || e.altKey) return false;
    E.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, add: e.shiftKey || e.ctrlKey };
    const b = $('#boxsel'); if (b) { b.hidden = false; boxPos(); } return true;
  },
  move(e) { if (!E.drag) return; E.drag.x1 = e.clientX; E.drag.y1 = e.clientY; boxPos(); },
  up(e) {
    const d = E.drag; E.drag = null; const b = $('#boxsel'); if (b) b.hidden = true; if (!d || !E.obj) return;
    E.selectIn(d.x0, d.y0, d.x1, d.y1, d.add);
  }
};
function boxPos() {
  const b = $('#boxsel'), d = E.drag; if (!b || !d) return; const r = V.host.getBoundingClientRect();
  b.style.left = (Math.min(d.x0, d.x1) - r.left) + 'px'; b.style.top = (Math.min(d.y0, d.y1) - r.top) + 'px';
  b.style.width = Math.abs(d.x1 - d.x0) + 'px'; b.style.height = Math.abs(d.y1 - d.y0) + 'px';
}
E.hook = function () {
  V.tc.addEventListener('mouseDown', () => { if (V.tc.object === E.pivot) E.begin(); });
  V.tc.addEventListener('objectChange', () => { if (V.tc.object === E.pivot) E.apply(); });
  V.tc.addEventListener('mouseUp', () => { if (V.tc.object === E.pivot) E.finish(); });
};

/* ===================== Skulptur ===================== */
const K = F.sculpt = { obj: null, adj: null, brush: 'draw', radius: 0.35, strength: 0.5, falloff: 'smooth', sym: false, invert: false, stroke: null, cursor: null };
const FALL = { smooth: t => (1 - t * t) * (1 - t * t), linear: t => 1 - t, sharp: t => (1 - t) * (1 - t), flat: t => (t < 0.85 ? 1 : (1 - t) / 0.15) };
K.ready = function (obj) {
  if (!obj || !obj.isMesh || obj.isSkinnedMesh) { F.say('Bitte ein normales Mesh auswählen', 'err'); return false; }
  K.obj = obj;
  if (!obj.userData.sculpt || !obj.geometry.index) { /* auch nach Rückgängig (Geometrie wieder unverschweißt) neu vorbereiten */
    const g = G.weld(obj.geometry, false); obj.userData.sculpt = true; V.setGeometry(obj, g, 'Für Skulptur vorbereiten', 'mesh', null);
    F.say('Mesh für Skulptur vorbereitet (Punkte verschweißt, UVs entfernt)');
  }
  K.adj = G.adjacency(obj.geometry); return true;
};
K.subdivide = function () {
  const o = K.obj || S.active; if (!K.ready(o)) return;
  if (F.geo.stats(o.geometry).tris * 4 > 400000) return F.say('Mesh ist bereits sehr fein', 'err');
  V.setGeometry(o, G.subdivideLoop(o.geometry), 'Unterteilen', 'mesh', null); o.userData.sculpt = true; K.adj = G.adjacency(o.geometry);
  F.say(F.geo.stats(o.geometry).tris + ' Dreiecke');
};
K.cursorMesh = function () {
  if (K.cursor) return K.cursor;
  const pts = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0)); }
  K.cursor = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffa630, depthTest: false, transparent: true }));
  K.cursor.renderOrder = 20; K.cursor.visible = false; K.cursor.userData.helper = true; V.overlay.add(K.cursor); return K.cursor;
};
K.hit = function (e) {
  if (!K.obj) return null; const r = V.ray(e).intersectObject(K.obj, false); return r[0] || null;
};
K.localRadius = () => K.radius / Math.max(1e-6, (Math.abs(K.obj.scale.x) + Math.abs(K.obj.scale.y) + Math.abs(K.obj.scale.z)) / 3);
K.dab = function (pLocal, nLocal) {
  const g = K.obj.geometry, pos = g.attributes.position, nor = g.attributes.normal, P = pos.array, N = nor.array, n = pos.count;
  const R = K.localRadius(), R2 = R * R, fall = FALL[K.falloff] || FALL.smooth, dir = K.invert ? -1 : 1, st = K.strength;
  // mittlere Normale im Pinselbereich
  let ax = 0, ay = 0, az = 0;
  for (let i = 0; i < n; i++) { const dx = P[i * 3] - pLocal.x, dy = P[i * 3 + 1] - pLocal.y, dz = P[i * 3 + 2] - pLocal.z; if (dx * dx + dy * dy + dz * dz < R2 * 0.5) { ax += N[i * 3]; ay += N[i * 3 + 1]; az += N[i * 3 + 2]; } }
  let l = Math.hypot(ax, ay, az); if (l < 1e-9) { ax = nLocal.x; ay = nLocal.y; az = nLocal.z; l = 1; } ax /= l; ay /= l; az /= l;
  const adj = K.adj, tmp = new Float32Array(0), upd = [];
  const b = K.brush;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], dx = x - pLocal.x, dy = y - pLocal.y, dz = z - pLocal.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= R2) continue; const w = fall(Math.sqrt(d2) / R); if (w <= 0) continue;
    if (b === 'draw') { const s = st * R * 0.1 * w * dir; P[i * 3] += ax * s; P[i * 3 + 1] += ay * s; P[i * 3 + 2] += az * s; }
    else if (b === 'inflate') { const s = st * R * 0.1 * w * dir; P[i * 3] += N[i * 3] * s; P[i * 3 + 1] += N[i * 3 + 1] * s; P[i * 3 + 2] += N[i * 3 + 2] * s; }
    else if (b === 'flatten') { const d = dx * ax + dy * ay + dz * az, s = d * Math.min(1, st * w * 0.7); P[i * 3] -= ax * s; P[i * 3 + 1] -= ay * s; P[i * 3 + 2] -= az * s; }
    else if (b === 'pinch') {
      let vx = -dx, vy = -dy, vz = -dz; const d = vx * ax + vy * ay + vz * az; vx -= ax * d; vy -= ay * d; vz -= az * d;
      const s = st * w * 0.22 * dir; P[i * 3] += vx * s; P[i * 3 + 1] += vy * s; P[i * 3 + 2] += vz * s;
    }
    else if (b === 'smooth') upd.push(i, w);
  }
  if (b === 'smooth' && upd.length) {
    const out = [];
    for (let q = 0; q < upd.length; q += 2) {
      const i = upd[q], w = upd[q + 1], s = adj.start[i], e = adj.start[i + 1], k = e - s; if (!k) continue;
      let x = 0, y = 0, z = 0; for (let j = s; j < e; j++) { const v = adj.list[j]; x += P[v * 3]; y += P[v * 3 + 1]; z += P[v * 3 + 2]; }
      const f = Math.min(1, st * w * 0.8); out.push(i, P[i * 3] + (x / k - P[i * 3]) * f, P[i * 3 + 1] + (y / k - P[i * 3 + 1]) * f, P[i * 3 + 2] + (z / k - P[i * 3 + 2]) * f);
    }
    for (let q = 0; q < out.length; q += 4) { const i = out[q]; P[i * 3] = out[q + 1]; P[i * 3 + 1] = out[q + 2]; P[i * 3 + 2] = out[q + 3]; }
  }
  pos.needsUpdate = true;
};
K.apply = function (hit) {
  const p = K.obj.worldToLocal(hit.point.clone()), nl = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
  K.dab(p, nl);
  if (K.sym) { const pm = p.clone(); pm.x = -pm.x; const nm = nl.clone(); nm.x = -nm.x; K.dab(pm, nm); }
  const g = K.obj.geometry; g.computeVertexNormals(); g.computeBoundingSphere();
};
F.tools.sculpt = {
  cursor: 'none',
  enter() { K.cursorMesh(); }, leave() { if (K.cursor) K.cursor.visible = false; V.requestRender(); },
  hover(e) {
    const c = K.cursorMesh(); const h = K.hit(e);
    if (!h) { c.visible = false; V.requestRender(); return; }
    const nw = h.face.normal.clone().transformDirection(K.obj.matrixWorld);
    c.position.copy(h.point).addScaledVector(nw, 0.002); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nw); c.scale.setScalar(K.radius); c.visible = true; V.requestRender();
  },
  down(e) {
    if (!K.obj || !K.obj.userData.sculpt) { if (!K.ready(S.active)) return false; }
    const h = K.hit(e); if (!h) return false;
    const g = K.obj.geometry;
    K.stroke = { old: Float32Array.from(g.attributes.position.array), last: h.point.clone(), t: 0 };
    if (K.brush === 'grab') {
      const p = K.obj.worldToLocal(h.point.clone()), P = g.attributes.position.array, R = K.localRadius(), idx = [], wts = [], base = [], fall = FALL[K.falloff];
      for (let i = 0; i < g.attributes.position.count; i++) { const dx = P[i * 3] - p.x, dy = P[i * 3 + 1] - p.y, dz = P[i * 3 + 2] - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d < R) { idx.push(i); wts.push(fall(d / R)); base.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); } }
      const nrm = V.cam.getWorldDirection(new THREE.Vector3());
      K.stroke.grab = { idx, wts, base, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, h.point), p0: h.point.clone() };
    } else K.apply(h);
    V.requestRender(); return true;
  },
  move(e) {
    const s = K.stroke; if (!s) return;
    if (s.grab) {
      const hit = new THREE.Vector3(); if (!V.ray(e).ray.intersectPlane(s.grab.plane, hit)) return;
      const dl = K.obj.worldToLocal(hit.clone()).sub(K.obj.worldToLocal(s.grab.p0.clone())), P = K.obj.geometry.attributes.position;
      s.grab.idx.forEach((i, q) => { const w = s.grab.wts[q]; P.setXYZ(i, s.grab.base[q * 3] + dl.x * w, s.grab.base[q * 3 + 1] + dl.y * w, s.grab.base[q * 3 + 2] + dl.z * w); });
      P.needsUpdate = true; K.obj.geometry.computeVertexNormals(); V.requestRender(); return;
    }
    const now = performance.now(); if (now - s.t < 14) return;
    const h = K.hit(e); if (!h) return;
    if (h.point.distanceTo(s.last) < K.radius * 0.16) return;
    s.t = now; s.last.copy(h.point); K.apply(h); V.requestRender();
  },
  up() {
    const s = K.stroke; K.stroke = null; if (!s || !K.obj) return;
    const g = K.obj.geometry; g.computeBoundingSphere(); g.computeBoundingBox();
    V.setPositionsUndo(K.obj, s.old, Float32Array.from(g.attributes.position.array), 'Skulptur-Strich'); V.refreshAll();
  }
};

/* ===================== Messen ===================== */
const M = F.measure = { pts: [], group: null, label: null, dist: 0 };
M.clear = function () {
  if (M.group) { V.overlay.remove(M.group); M.group = null; } M.pts = []; M.dist = 0; const l = $('#vp-measure'); if (l) l.hidden = true; V.requestRender();
};
F.tools.measure = {
  cursor: 'crosshair',
  enter() { F.say('Messen: zwei Punkte auf der Oberfläche anklicken'); }, leave() { M.clear(); },
  down(e) {
    const h = V.pick(e)[0]; if (!h) return false;
    if (M.pts.length >= 2) M.clear();
    M.pts.push(h.point.clone());
    if (!M.group) { M.group = new THREE.Group(); V.overlay.add(M.group); }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffa630, depthTest: false })); dot.renderOrder = 30; dot.position.copy(h.point); dot.userData.dot = true; dot.raycast = () => { }; M.group.add(dot);
    if (M.pts.length === 2) {
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(M.pts), new THREE.LineBasicMaterial({ color: 0xffa630, depthTest: false })); ln.renderOrder = 30; ln.raycast = () => { }; M.group.add(ln);
      M.dist = M.pts[0].distanceTo(M.pts[1]); const d = M.pts[1].clone().sub(M.pts[0]);
      F.say('Abstand ' + fix(M.dist, 4) + ' m  (Δx ' + fix(d.x, 3) + ', Δy ' + fix(d.y, 3) + ', Δz ' + fix(d.z, 3) + ')');
    }
    V.requestRender(); return true;
  },
  up() { }
};
V.updateLabels = function () {
  const l = $('#vp-measure'); if (!l) return;
  if (M.pts.length < 2) { l.hidden = true; return; }
  const mid = M.pts[0].clone().add(M.pts[1]).multiplyScalar(0.5).project(V.cam), r = V.dom.getBoundingClientRect();
  if (mid.z > 1) { l.hidden = true; return; }
  l.hidden = false; l.textContent = fix(M.dist, 3) + ' m';
  l.style.left = ((mid.x * 0.5 + 0.5) * r.width) + 'px'; l.style.top = ((-mid.y * 0.5 + 0.5) * r.height) + 'px';
};
