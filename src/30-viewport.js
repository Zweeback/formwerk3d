/* ============================================================
   Viewport: Szene, Kamera, Auswahl, Gizmo, Primitive, Werkzeug-Router
   ============================================================ */
const S = F.state = { sel: [], active: null, mode: 'object', tool: 'select', gizmo: 'translate', snap: false, shading: 'solid', ortho: false };
const V = F.view = {};
F.tools = {};
const PALETTE = ['#8fa3bf', '#c9a66b', '#7fb59a', '#c47d6d', '#a39bc7', '#d6c46a', '#6fa8b8', '#b88aa5'];
let colorIdx = 0;

/* ---------- Primitive (parametrisch) ---------- */
const I = { int: true, min: 1, step: 1 }, D = { min: 0.001, step: 0.05 };
F.prims = {
  box: { label: 'Quader', p: { w: 1, h: 1, d: 1, sx: 1, sy: 1, sz: 1 }, f: [['w', 'Breite', D], ['h', 'Höhe', D], ['d', 'Tiefe', D], ['sx', 'Seg. X', I], ['sy', 'Seg. Y', I], ['sz', 'Seg. Z', I]], build: p => new THREE.BoxGeometry(p.w, p.h, p.d, p.sx, p.sy, p.sz) },
  sphere: { label: 'Kugel', p: { r: 0.5, ws: 32, hs: 16 }, f: [['r', 'Radius', D], ['ws', 'Seg. Länge', { int: true, min: 3, step: 1 }], ['hs', 'Seg. Breite', { int: true, min: 2, step: 1 }]], build: p => new THREE.SphereGeometry(p.r, p.ws, p.hs) },
  icosphere: { label: 'Icosphere', p: { r: 0.5, detail: 3 }, f: [['r', 'Radius', D], ['detail', 'Unterteilung', { int: true, min: 0, step: 1 }]], build: p => new THREE.IcosahedronGeometry(p.r, Math.min(p.detail, 6)) },
  cylinder: { label: 'Zylinder', p: { rt: 0.5, rb: 0.5, h: 1, seg: 32, hseg: 1 }, f: [['rt', 'Radius oben', { min: 0, step: 0.05 }], ['rb', 'Radius unten', { min: 0, step: 0.05 }], ['h', 'Höhe', D], ['seg', 'Segmente', { int: true, min: 3, step: 1 }], ['hseg', 'Seg. Höhe', I]], build: p => new THREE.CylinderGeometry(p.rt, p.rb, p.h, p.seg, p.hseg) },
  cone: { label: 'Kegel', p: { r: 0.5, h: 1, seg: 32 }, f: [['r', 'Radius', D], ['h', 'Höhe', D], ['seg', 'Segmente', { int: true, min: 3, step: 1 }]], build: p => new THREE.CylinderGeometry(0, p.r, p.h, p.seg) },
  torus: { label: 'Torus', p: { R: 0.5, r: 0.18, rs: 16, ts: 40 }, f: [['R', 'Hauptradius', D], ['r', 'Rohrradius', D], ['rs', 'Seg. Rohr', { int: true, min: 3, step: 1 }], ['ts', 'Seg. Ring', { int: true, min: 3, step: 1 }]], build: p => new THREE.TorusGeometry(p.R, p.r, p.rs, p.ts).rotateX(Math.PI / 2) },
  plane: { label: 'Fläche', p: { w: 2, d: 2, sx: 1, sz: 1 }, f: [['w', 'Breite', D], ['d', 'Tiefe', D], ['sx', 'Seg. X', I], ['sz', 'Seg. Z', I]], build: p => new THREE.PlaneGeometry(p.w, p.d, p.sx, p.sz).rotateX(-Math.PI / 2) },
  capsule: { label: 'Kapsel', p: { r: 0.3, len: 0.8, seg: 12 }, f: [['r', 'Radius', D], ['len', 'Länge', D], ['seg', 'Segmente', { int: true, min: 2, step: 1 }]], build: p => new THREE.CapsuleGeometry(p.r, p.len, p.seg, p.seg * 2) },
  knot: { label: 'Knoten', p: { R: 0.5, r: 0.14, ts: 96, rs: 12, pp: 2, q: 3 }, f: [['R', 'Radius', D], ['r', 'Rohr', D], ['ts', 'Seg. Länge', { int: true, min: 8, step: 4 }], ['rs', 'Seg. Rohr', { int: true, min: 3, step: 1 }], ['pp', 'p', I], ['q', 'q', I]], build: p => new THREE.TorusKnotGeometry(p.R, p.r, p.ts, p.rs, p.pp, p.q) },
  pipe: { label: 'Rohr', p: { ro: 0.5, ri: 0.35, h: 1, seg: 40 }, f: [['ro', 'Außenradius', D], ['ri', 'Innenradius', D], ['h', 'Länge', D], ['seg', 'Segmente', { int: true, min: 6, step: 1 }]], build: p => {
    const s = new THREE.Shape(); s.absarc(0, 0, p.ro, 0, Math.PI * 2, false);
    const hp = new THREE.Path(); hp.absarc(0, 0, Math.min(p.ri, p.ro - 0.001), 0, Math.PI * 2, true); s.holes.push(hp);
    const g = new THREE.ExtrudeGeometry(s, { depth: p.h, bevelEnabled: false, curveSegments: p.seg });
    return g.rotateX(-Math.PI / 2).translate(0, -p.h / 2, 0); } },
  gear: { label: 'Zahnrad', p: { teeth: 16, ro: 0.5, ri: 0.42, thick: 0.15, hole: 0.12 }, f: [['teeth', 'Zähne', { int: true, min: 4, step: 1 }], ['ro', 'Außenradius', D], ['ri', 'Fußradius', D], ['thick', 'Dicke', D], ['hole', 'Bohrung', { min: 0, step: 0.01 }]], build: p => {
    const s = new THREE.Shape(), n = p.teeth, pt = 2 * Math.PI / n, pos = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
    for (let i = 0; i < n; i++) {
      const a = i * pt, q = [pos(p.ri, a), pos(p.ro, a + pt * 0.16), pos(p.ro, a + pt * 0.40), pos(p.ri, a + pt * 0.56)];
      q.forEach((c, k) => (i === 0 && k === 0) ? s.moveTo(c[0], c[1]) : s.lineTo(c[0], c[1]));
    }
    s.closePath();
    if (p.hole > 0.001) { const hp = new THREE.Path(); hp.absarc(0, 0, Math.min(p.hole, p.ri * 0.95), 0, Math.PI * 2, true); s.holes.push(hp); }
    const g = new THREE.ExtrudeGeometry(s, { depth: p.thick, bevelEnabled: false, curveSegments: 24 });
    return g.rotateX(-Math.PI / 2).translate(0, -p.thick / 2, 0); } }
};

/* ---------- Aufbau ---------- */
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#808080';
V.init = function (host) {
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  const renderer = V.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  V.host = host; V.dom = renderer.domElement; host.appendChild(V.dom);
  V.scene = new THREE.Scene();
  V.world = new THREE.Group(); V.world.name = 'world'; V.scene.add(V.world);
  V.overlay = new THREE.Group(); V.overlay.name = 'overlay'; V.scene.add(V.overlay);

  V.persp = new THREE.PerspectiveCamera(50, 1, 0.01, 4000); V.persp.position.set(4, 3.2, 5);
  V.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000); V.orthoHalf = 3;
  V.cam = V.persp;
  V.controls = new THREE.OrbitControls(V.cam, V.dom);
  V.controls.enableDamping = false; V.controls.screenSpacePanning = true;
  V.controls.addEventListener('change', V.requestRender);

  // Licht folgt der Kamera, damit Formen beim Drehen gut lesbar bleiben
  V.lights = new THREE.Group(); V.scene.add(V.lights);
  V.lights.add(new THREE.HemisphereLight(0xffffff, 0x58606e, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(2, 3, 4); V.lights.add(key); key.target.position.set(0, 0, 0); V.lights.add(key.target);
  const fill = new THREE.DirectionalLight(0xdde6ff, 0.3); fill.position.set(-3, -1, 2); V.lights.add(fill); V.lights.add(fill.target);

  V.tc = new THREE.TransformControls(V.cam, V.dom); V.tc.setSize(0.9); V.scene.add(V.tc);
  let before = null;
  V.tc.addEventListener('dragging-changed', e => { V.controls.enabled = !e.value; });
  V.tc.addEventListener('change', V.requestRender);
  V.tc.addEventListener('mouseDown', () => {
    const o = V.tc.object; if (!o || !o.userData || o.userData.gizmoTarget === 'pivot') { before = null; return; }
    before = { o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() };
  });
  V.tc.addEventListener('mouseUp', () => {
    if (!before) return; const { o, p, q, s } = before; before = null;
    const np = o.position.clone(), nq = o.quaternion.clone(), ns = o.scale.clone();
    if (p.equals(np) && q.equals(nq) && s.equals(ns)) return;
    H.push('Transformieren', () => { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }, () => { o.position.copy(np); o.quaternion.copy(nq); o.scale.copy(ns); });
  });
  V.tc.addEventListener('objectChange', () => { F.ui && F.ui.refreshTransform && F.ui.refreshTransform(); });

  V.selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffa630); V.selBox.visible = false; V.overlay.add(V.selBox);
  V.buildGrid(); V.applyTheme();
  new ResizeObserver(() => V.resize()).observe(host);
  V.resize();
  installPointer();
  const loop = (t) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (t - (V._t || t)) / 1000); V._t = t;
    for (let i = 0; i < F.ticks.length; i++) F.ticks[i](dt);
    if (V.dirty) { V.dirty = false; V.render(); }
  };
  requestAnimationFrame(loop);
};
V.requestRender = () => { V.dirty = true; };
V.render = function () {
  V.lights.position.copy(V.cam.position); V.lights.quaternion.copy(V.cam.quaternion);
  if (V.selBox.visible) V.selBox.update();
  V.updateLabels && V.updateLabels();
  V.renderer.render(V.scene, V.cam);
};
V.resize = function () {
  const w = Math.max(10, V.host.clientWidth), hh = Math.max(10, V.host.clientHeight);
  V.renderer.setSize(w, hh, false); V.dom.style.width = '100%'; V.dom.style.height = '100%';
  V.persp.aspect = w / hh; V.persp.updateProjectionMatrix();
  const a = w / hh, hf = V.orthoHalf; V.orthoCam.left = -hf * a; V.orthoCam.right = hf * a; V.orthoCam.top = hf; V.orthoCam.bottom = -hf; V.orthoCam.updateProjectionMatrix();
  V.requestRender();
};
V.buildGrid = function () {
  if (V.grid) { V.overlay.remove(V.grid); V.grid.geometry.dispose(); }
  V.grid = new THREE.GridHelper(60, 60, new THREE.Color(cssVar('--vp-grid-a')), new THREE.Color(cssVar('--vp-grid-b')));
  V.grid.material.transparent = true; V.grid.material.opacity = 0.9; V.grid.position.y = -0.0005; V.grid.userData.helper = true;
  V.overlay.add(V.grid);
  if (V.axes) { V.overlay.remove(V.axes); V.axes.geometry.dispose(); }
  const g = new THREE.BufferGeometry(), P = [-30, 0, 0, 30, 0, 0, 0, 0, -30, 0, 0, 30, 0, 0, 0, 0, 3, 0], C = [];
  const cx = new THREE.Color('#e5484d'), cz = new THREE.Color('#3b82f6'), cy = new THREE.Color('#46c37b');
  [cx, cx, cz, cz, cy, cy].forEach(c => C.push(c.r, c.g, c.b));
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  V.axes = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })); V.axes.userData.helper = true; V.overlay.add(V.axes);
};
V.applyTheme = function () {
  V.scene.background = new THREE.Color(cssVar('--vp-bg'));
  V.buildGrid(); V.requestRender();
};

/* ---------- Kamera ---------- */
V.setOrtho = function (on) {
  if (on === S.ortho) return; S.ortho = on;
  const from = V.cam, to = on ? V.orthoCam : V.persp, tgt = V.controls.target, dist = from.position.distanceTo(tgt);
  to.position.copy(from.position); to.quaternion.copy(from.quaternion);
  if (on) { V.orthoHalf = Math.max(0.05, dist * Math.tan(V.persp.fov * DEG / 2)); to.zoom = 1; V.resize(); }
  else { const d = V.orthoHalf / Math.tan(V.persp.fov * DEG / 2) / Math.max(0.01, from.zoom); const dir = new THREE.Vector3().subVectors(from.position, tgt).normalize(); to.position.copy(tgt).addScaledVector(dir, d); }
  V.cam = to; V.controls.object = to; V.tc.camera = to; to.updateProjectionMatrix(); V.controls.update(); V.requestRender();
  F.ui && F.ui.refreshToolbar && F.ui.refreshToolbar();
};
V.viewDir = function (name) {
  const d = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], iso: [1, 0.8, 1] }[name]; if (!d) return;
  const t = V.controls.target, dist = Math.max(1, V.cam.position.distanceTo(t));
  V.cam.position.copy(t).addScaledVector(new THREE.Vector3(d[0], d[1], d[2]).normalize(), dist);
  V.cam.lookAt(t); V.controls.update(); V.requestRender();
};
V.frame = function (objs) {
  const box = new THREE.Box3();
  (objs && objs.length ? objs : V.objects()).forEach(o => { if (o.visible) box.expandByObject(o); });
  if (box.isEmpty()) { box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1)); }
  const c = box.getCenter(new THREE.Vector3()), r = Math.max(0.2, box.getSize(new THREE.Vector3()).length() / 2);
  const dir = new THREE.Vector3().subVectors(V.cam.position, V.controls.target).normalize();
  if (S.ortho) { V.orthoHalf = r * 1.15; V.orthoCam.zoom = 1; V.resize(); V.cam.position.copy(c).addScaledVector(dir, r * 4); }
  else V.cam.position.copy(c).addScaledVector(dir, r / Math.sin(V.persp.fov * DEG / 2) * 1.1);
  V.controls.target.copy(c); V.cam.lookAt(c); V.controls.update(); V.requestRender();
};

/* ---------- Objekte ---------- */
V.objects = () => V.world.children.filter(o => o.isMesh);
V.uniqueName = function (base) {
  const names = new Set(V.world.children.map(o => o.name));
  if (!names.has(base)) return base;
  let i = 1; while (names.has(base + '.' + String(i).padStart(3, '0'))) i++;
  return base + '.' + String(i).padStart(3, '0');
};
V.makeMaterial = function (color) {
  const m = new THREE.MeshStandardMaterial({ color: color || PALETTE[colorIdx++ % PALETTE.length], roughness: 0.55, metalness: 0.08 });
  m.userData.opacity = 1; return m;
};
V.build = function (kind, params) {
  const P = F.prims[kind]; if (!P) throw new Error('Unbekanntes Objekt: ' + kind);
  const p = Object.assign({}, P.p, params || {});
  for (const f of P.f) { const o = f[2] || {}; let v = num(p[f[0]], P.p[f[0]]); if (o.int) v = Math.round(v); if (o.min !== undefined) v = Math.max(o.min, v); p[f[0]] = v; }
  return { geo: P.build(p), params: p };
};
V.addMesh = function (geo, o) {
  o = o || {};
  const mesh = new THREE.Mesh(geo, o.material || V.makeMaterial(o.color));
  mesh.name = V.uniqueName(o.name || 'Objekt');
  mesh.userData.kind = o.kind || 'mesh'; mesh.userData.params = o.params || null;
  if (o.position) mesh.position.fromArray(o.position);
  else if (o.dropToGrid !== false) { geo.computeBoundingBox(); mesh.position.y = -geo.boundingBox.min.y; }
  if (o.rotation) mesh.rotation.set(o.rotation[0] * DEG, o.rotation[1] * DEG, o.rotation[2] * DEG);
  if (o.scale) mesh.scale.fromArray(o.scale);
  V.world.add(mesh); V.applyDisplay(mesh);
  if (!o.silent) {
    H.push('Hinzufügen: ' + mesh.name, () => V._detach(mesh), () => V._attach(mesh));
    if (o.select !== false) V.select(mesh);
    V.refreshAll();
  }
  return mesh;
};
V.add = function (kind, params, opts) {
  const b = V.build(kind, params);
  return V.addMesh(b.geo, Object.assign({ name: F.prims[kind].label, kind, params: b.params }, opts || {}));
};
V._detach = function (o) { V.world.remove(o); S.sel = S.sel.filter(x => x !== o); if (S.active === o) S.active = S.sel[S.sel.length - 1] || null; V.refreshAll(); };
V._attach = function (o) { V.world.add(o); V.refreshAll(); };
V.remove = function (list) {
  list = (list || S.sel).slice(); if (!list.length) return;
  list.forEach(o => V._detach(o));
  H.push('Löschen', () => list.forEach(o => V._attach(o)), () => list.forEach(o => V._detach(o)));
};
V.duplicate = function (list) {
  list = (list || S.sel).slice(); const out = [];
  list.forEach(src => {
    if (src.isSkinnedMesh) { F.say('Geriggte Objekte lassen sich nicht duplizieren', 'err'); return; }
    const c = new THREE.Mesh(src.geometry.clone(), src.material.clone());
    c.userData = JSON.parse(JSON.stringify(src.userData || {})); c.userData.wire = null;
    c.material.userData = Object.assign({}, src.material.userData);
    c.name = V.uniqueName(src.name.replace(/\.\d+$/, '')); c.position.copy(src.position).add(new THREE.Vector3(0.3, 0, 0.3)); c.quaternion.copy(src.quaternion); c.scale.copy(src.scale);
    V.world.add(c); V.applyDisplay(c); out.push(c);
  });
  if (!out.length) return out;
  H.push('Duplizieren', () => out.forEach(o => V._detach(o)), () => out.forEach(o => V._attach(o)));
  V.select(out[0]); out.slice(1).forEach(o => V.select(o, true)); V.refreshAll(); return out;
};
V.setGeometry = function (obj, geo, label, kind, params) {
  const old = obj.geometry, ok = obj.userData.kind, op = obj.userData.params;
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  const apply = (g, k, p) => { obj.geometry = g; obj.userData.kind = k; obj.userData.params = p; V.rebuildWire(obj); V.refreshAll(); };
  apply(geo, kind || 'mesh', params || null);
  H.push(label || 'Geometrie', () => apply(old, ok, op), () => apply(geo, kind || 'mesh', params || null), { evict: () => old.dispose(), clear: () => geo.dispose() });
};
V.setPositionsUndo = function (obj, oldArr, newArr, label) {
  const set = arr => { const a = obj.geometry.attributes.position; a.array.set(arr); a.needsUpdate = true; obj.geometry.computeVertexNormals(); obj.geometry.computeBoundingSphere(); obj.geometry.computeBoundingBox(); V.refreshAll(); F.edit && F.edit.refreshPoints && F.edit.refreshPoints(); };
  H.push(label, () => set(oldArr), () => set(newArr));
};
V.replaceObject = function (oldO, newO, label) { // z.B. Mesh -> SkinnedMesh
  const i = V.world.children.indexOf(oldO);
  const swap = (a, b) => { V.world.remove(a); V.world.add(b); S.sel = S.sel.map(x => x === a ? b : x); if (S.active === a) S.active = b; V.applyDisplay(b); V.refreshAll(); };
  swap(oldO, newO); H.push(label || 'Ersetzen', () => swap(newO, oldO), () => swap(oldO, newO));
};

/* ---------- Darstellung ---------- */
V.applyDisplay = function (mesh) {
  const m = mesh.material; if (!m) return;
  const op = m.userData.opacity === undefined ? 1 : m.userData.opacity, xray = S.shading === 'xray';
  m.transparent = op < 1 || xray; m.opacity = xray ? Math.min(op, 0.38) : op; m.depthWrite = !xray; m.wireframe = S.shading === 'wire';
  const sel = S.sel.indexOf(mesh) >= 0;
  if (m.emissive) m.emissive.setHex(sel ? 0x3a2300 : 0x000000);
  V.rebuildWire(mesh);
};
V.rebuildWire = function (mesh) {
  if (mesh.userData.wire) { mesh.remove(mesh.userData.wire); mesh.userData.wire.geometry.dispose(); mesh.userData.wire = null; }
  if (S.shading !== 'solidwire' || !mesh.geometry) return;
  const tris = F.geo.stats(mesh.geometry).tris; if (tris > 60000) return;
  const w = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar('--vp-wire')), transparent: true, opacity: 0.55 }));
  w.userData.helper = true; w.raycast = () => { }; mesh.add(w); mesh.userData.wire = w;
};
V.setShading = function (mode) { S.shading = mode; V.objects().forEach(V.applyDisplay); V.requestRender(); F.ui && F.ui.refreshToolbar && F.ui.refreshToolbar(); };

/* ---------- Auswahl ---------- */
V.select = function (o, add) {
  if (!o) { S.sel = []; S.active = null; }
  else if (add) { const i = S.sel.indexOf(o); if (i >= 0) { S.sel.splice(i, 1); S.active = S.sel[S.sel.length - 1] || null; } else { S.sel.push(o); S.active = o; } }
  else { S.sel = [o]; S.active = o; }
  V.refreshAll();
};
V.focusSel = () => V.frame(S.sel.length ? S.sel : null);
V.refreshAll = function () {
  V.objects().forEach(o => { if (o.material && o.material.emissive) o.material.emissive.setHex(S.sel.indexOf(o) >= 0 ? 0x3a2300 : 0x000000); });
  const a = S.active;
  if (a && a.parent === V.world) { V.selBox.setFromObject(a); V.selBox.visible = V.objMode() || S.mode === 'rig'; } else V.selBox.visible = false;
  V.syncGizmo();
  F.ui && F.ui.refreshAll && F.ui.refreshAll();
  V.requestRender();
};
V.syncGizmo = function () {
  const gizmoOn = V.objMode() && S.active && S.active.parent === V.world && S.tool === 'select';
  if (gizmoOn) { V.tc.attach(S.active); V.tc.setMode(S.gizmo); V.tc.setTranslationSnap(S.snap ? 0.25 : null); V.tc.setRotationSnap(S.snap ? 15 * DEG : null); V.tc.setScaleSnap(S.snap ? 0.1 : null); V.tc.visible = true; }
  else if (!(F.edit && F.edit.gizmoActive && F.edit.gizmoActive()) && !(F.rig && F.rig.gizmoActive && F.rig.gizmoActive())) { V.tc.detach(); }
};
V.setGizmo = function (mode) { S.gizmo = mode; V.tc.setMode(mode); F.ui && F.ui.refreshToolbar && F.ui.refreshToolbar(); V.requestRender(); };

V.setTransform = function (obj, patch) {
  const p = obj.position.clone(), q = obj.quaternion.clone(), s = obj.scale.clone();
  if (patch.pos) obj.position.fromArray(patch.pos);
  if (patch.rot) obj.rotation.set(patch.rot[0] * DEG, patch.rot[1] * DEG, patch.rot[2] * DEG);
  if (patch.scale) { const k = patch.scale.map(v => (Math.abs(v) < 1e-4 ? 1e-4 : v)); obj.scale.fromArray(k); }
  const np = obj.position.clone(), nq = obj.quaternion.clone(), ns = obj.scale.clone();
  if (p.equals(np) && q.equals(nq) && s.equals(ns)) return;
  H.push('Transformieren', () => { obj.position.copy(p); obj.quaternion.copy(q); obj.scale.copy(s); V.refreshAll(); }, () => { obj.position.copy(np); obj.quaternion.copy(nq); obj.scale.copy(ns); V.refreshAll(); });
  V.refreshAll();
};
V.stats = function () {
  let v = 0, t = 0; V.objects().forEach(o => { if (!o.visible) return; const s = F.geo.stats(o.geometry); v += s.verts; t += s.tris; });
  return { objects: V.objects().length, verts: v, tris: t };
};
V.screenshot = function () { V.render(); return V.dom.toDataURL('image/png'); };

/* ---------- Eingabe-Router ---------- */
const ray = new THREE.Raycaster();
V.ndc = function (e) { const r = V.dom.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
V.ray = function (e) { ray.setFromCamera(V.ndc(e), V.cam); return ray; };
V.pick = function (e, objs) { return V.ray(e).intersectObjects(objs || V.objects().filter(o => o.visible), false); };
V.setTool = function (name) {
  const old = F.tools[S.tool]; if (old && old.leave) old.leave();
  S.tool = name; const nt = F.tools[name]; if (nt && nt.enter) nt.enter();
  V.dom.style.cursor = (nt && nt.cursor) || 'default'; V.syncGizmo(); F.ui && F.ui.refreshToolbar && F.ui.refreshToolbar();
};
function installPointer() {
  const host = V.host; let cap = null, start = null, moved = false;
  host.addEventListener('pointerdown', e => {
    start = { x: e.clientX, y: e.clientY, shift: e.shiftKey || e.ctrlKey || e.metaKey }; moved = false;
    if (e.button !== 0 || e.altKey) return;
    const tool = F.tools[S.tool];
    if (V.tc.dragging) { start = null; return; }
    if (V.tc.object && V.tc.visible) { const n = V.ndc(e); V.tc.pointerHover({ x: n.x, y: n.y, button: -1 }); if (V.tc.axis) { start = null; return; } }
    if (tool && tool.down && tool.down(e)) {
      cap = tool; V.controls.enabled = false; e.stopImmediatePropagation(); e.preventDefault();
      try { host.setPointerCapture(e.pointerId); } catch (x) { }
    }
  }, true);
  host.addEventListener('pointermove', e => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) moved = true;
    if (cap) { if (cap.move) cap.move(e); e.stopImmediatePropagation(); }
    else { const t = F.tools[S.tool]; if (t && t.hover && e.buttons === 0) t.hover(e); }
  }, true);
  const up = e => {
    if (cap) { const c = cap; cap = null; V.controls.enabled = true; c.up && c.up(e); try { host.releasePointerCapture(e.pointerId); } catch (x) { } start = null; return; }
    if (start && !moved && e.button === 0 && V.objMode() && !V.tc.dragging && S.tool === 'select') {
      const hit = V.pick(e)[0];
      if (hit) V.select(hit.object, start.shift); else if (!start.shift) V.select(null);
    }
    start = null;
  };
  host.addEventListener('pointerup', up, true);
  host.addEventListener('pointercancel', e => { if (cap) { const c = cap; cap = null; V.controls.enabled = true; c.up && c.up(e); } start = null; }, true);
}
