/* ============================================================
   Rigging: Knochen, Auto-Gewichte, Pose, Keyframes, IK (CCD)
   ============================================================ */
const RG = F.rig = {
  root: new THREE.Group(), bones: [], sel: null, mode: 'edit', place: false, size: 1, gizmo: 'rotate',
  mesh: null, skeleton: null, keys: [], time: 0, playing: false, duration: 2, loop: true, fps: 24,
  ik: { on: false, end: null, len: 3, target: null }, rest: new Map(), joints: []
};
RG.root.name = 'Rig';
const Y_AXIS = new THREE.Vector3(0, 1, 0);
RG.init = function () {
  V.scene.add(RG.root);
  V.tc.addEventListener('objectChange', () => {
    if (S.mode !== 'rig') return;
    if (V.tc.object === RG.ik.target) RG.solveIK();
    V.requestRender(); F.ui && F.ui.refreshRig && F.ui.refreshRig(true);
  });
  F.ticks.push(RG.tick);
};
RG.gizmoActive = () => S.mode === 'rig' && !!(RG.sel || (RG.ik.on && RG.ik.target));
RG.unique = function (base) {
  const names = new Set(RG.bones.map(b => b.name)); if (!names.has(base)) return base;
  let i = 1; while (names.has(base + '.' + String(i).padStart(2, '0'))) i++; return base + '.' + String(i).padStart(2, '0');
};
RG.children = b => b.children.filter(c => c.isBone);

/* ---------- Darstellung ---------- */
RG.mats = function () {
  if (!RG.m) RG.m = {
    joint: new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--bone')), depthTest: false, transparent: true, opacity: 0.95 }),
    sel: new THREE.MeshBasicMaterial({ color: 0xffa630, depthTest: false, transparent: true }),
    stick: new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--bone')), depthTest: false, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
  };
  return RG.m;
};
RG.decorate = function (b) {
  b.children.filter(c => c.userData.rigHelper).forEach(c => { b.remove(c); });
  const m = RG.mats(), r = 0.032 * RG.size;
  const j = new THREE.Mesh(RG.jointGeo || (RG.jointGeo = new THREE.SphereGeometry(1, 12, 8)), RG.sel === b ? m.sel : m.joint);
  j.scale.setScalar(r * (RG.sel === b ? 1.35 : 1)); j.userData.rigHelper = true; j.userData.bone = b; j.renderOrder = 60; b.add(j);
  const kids = RG.children(b);
  const stick = (dir, len) => {
    if (len < 1e-5) return; const g = RG.stickGeo || (RG.stickGeo = new THREE.CylinderGeometry(0, 1, 1, 4, 1).translate(0, 0.5, 0));
    const s = new THREE.Mesh(g, m.stick); s.userData.rigHelper = true; s.raycast = () => { }; s.renderOrder = 55;
    s.scale.set(r * 1.15, len, r * 1.15); s.quaternion.setFromUnitVectors(Y_AXIS, dir.clone().normalize()); b.add(s);
  };
  if (kids.length) kids.forEach(k => stick(k.position, k.position.length()));
  else {
    let d = new THREE.Vector3(0, 1, 0), L = 0.12 * RG.size;
    if (b.parent && b.parent.isBone) { d = b.position.clone(); if (d.length() < 1e-5) d.set(0, 1, 0); L = Math.max(0.05, d.length() * 0.4); }
    stick(d, L);
  }
};
RG.refreshViz = function () {
  RG.joints = []; RG.bones.forEach(b => { RG.decorate(b); b.children.forEach(c => { if (c.userData.bone) RG.joints.push(c); }); });
  V.requestRender();
};
RG.setSize = function (s) { RG.size = s; RG.refreshViz(); };
/* Importierte Skelette (viele Knochen) nur im Rig-Modus zeigen, sonst verdecken sie das Modell */
RG.syncVis = function () { RG.root.visible = S.mode === 'rig' || !RG.hideOutside; V.requestRender(); };

/* ---------- Knochen anlegen / ändern ---------- */
RG.addBone = function (name, worldPos, parent) {
  const b = new THREE.Bone(); b.name = RG.unique(name || 'Knochen'); const host = parent || RG.root;
  host.add(b); host.updateMatrixWorld(true); b.position.copy(host.worldToLocal(worldPos.clone()));
  if (parent === undefined || parent === null) { /* Wurzel */ }
  RG.bones.push(b); RG.refreshViz(); return b;
};
RG.remove = function (b) {
  if (RG.skeleton) return F.say('Das Skelett ist an ein Mesh gebunden – zuerst „Lösen“', 'err');
  const all = []; b.traverse(o => { if (o.isBone) all.push(o); });
  b.parent.remove(b); RG.bones = RG.bones.filter(x => all.indexOf(x) < 0); if (all.indexOf(RG.sel) >= 0) RG.sel = null;
  RG.refreshViz(); RG.select(RG.sel);
};
RG.clearAll = function () {
  RG.unbind(true); RG.stopIK(); RG.bones.slice().forEach(b => { if (b.parent === RG.root) RG.root.remove(b); }); RG.bones = []; RG.sel = null; RG.keys = []; RG.time = 0; RG.rest.clear(); RG.hideOutside = false; RG.refreshViz(); RG.select(null);
};
RG.select = function (b) {
  RG.sel = b || null; RG.bones.forEach(x => RG.decorate(x)); RG.joints = []; RG.bones.forEach(x => x.children.forEach(c => { if (c.userData.bone) RG.joints.push(c); }));
  RG.attachGizmo(); F.ui && F.ui.refreshRig && F.ui.refreshRig(); V.requestRender();
};
RG.attachGizmo = function () {
  if (S.mode !== 'rig') return;
  if (RG.ik.on && RG.ik.target) { V.tc.attach(RG.ik.target); V.tc.setMode('translate'); V.tc.visible = true; return; }
  if (RG.sel) { V.tc.attach(RG.sel); V.tc.setMode(RG.mode === 'pose' ? RG.gizmo : 'translate'); V.tc.visible = true; V.tc.setSpace('world'); }
  else V.tc.detach();
};

/* ---------- Posen ---------- */
RG.saveRest = function () { RG.rest.clear(); RG.bones.forEach(b => RG.rest.set(b, { p: b.position.clone(), q: b.quaternion.clone() })); };
RG.resetPose = function () { RG.bones.forEach(b => { const r = RG.rest.get(b); if (r) { b.position.copy(r.p); b.quaternion.copy(r.q); } else b.quaternion.identity(); }); RG.root.updateMatrixWorld(true); V.requestRender(); };
RG.setMode = function (m) {
  if (m === RG.mode) return;
  if (m === 'edit') { if (RG.skeleton) { F.say('Zum Bearbeiten der Knochen zuerst das Mesh lösen', 'err'); return; } RG.resetPose(); }
  if (m === 'pose') RG.saveRest();
  RG.mode = m; RG.attachGizmo(); F.ui && F.ui.refreshRig && F.ui.refreshRig();
};
RG.capture = function () { const o = {}; RG.bones.forEach(b => { o[b.name] = [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]; }); return o; };
RG.applyPose = function (p) { RG.bones.forEach(b => { const v = p[b.name]; if (v) { b.position.set(v[0], v[1], v[2]); b.quaternion.set(v[3], v[4], v[5], v[6]); } }); RG.root.updateMatrixWorld(true); V.requestRender(); };
RG.setKey = function (t) {
  if (!RG.bones.length) return F.say('Keine Knochen vorhanden', 'err'); t = fix(t, 3);
  const i = RG.keys.findIndex(k => Math.abs(k.t - t) < 0.5 / RG.fps); const k = { t, pose: RG.capture() };
  if (i >= 0) RG.keys[i] = k; else { RG.keys.push(k); RG.keys.sort((a, b) => a.t - b.t); }
  F.ui && F.ui.refreshRig && F.ui.refreshRig(); F.say('Key bei ' + t + ' s gesetzt (' + RG.keys.length + ' Keys)');
};
RG.delKey = function (t) { const i = RG.keys.findIndex(k => Math.abs(k.t - t) < 0.5 / RG.fps); if (i >= 0) RG.keys.splice(i, 1); F.ui && F.ui.refreshRig && F.ui.refreshRig(); };
RG.sample = function (t) {
  const K = RG.keys; if (!K.length) return;
  let a = K[0], b = K[K.length - 1];
  if (t <= a.t) b = a; else if (t >= b.t) a = b; else { for (let i = 0; i < K.length - 1; i++) if (t >= K[i].t && t <= K[i + 1].t) { a = K[i]; b = K[i + 1]; break; } }
  const f = a === b ? 0 : (t - a.t) / (b.t - a.t), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  RG.bones.forEach(bn => {
    const pa = a.pose[bn.name], pb = b.pose[bn.name]; if (!pa) return; const p2 = pb || pa;
    bn.position.set(pa[0] + (p2[0] - pa[0]) * f, pa[1] + (p2[1] - pa[1]) * f, pa[2] + (p2[2] - pa[2]) * f);
    qa.set(pa[3], pa[4], pa[5], pa[6]); qb.set(p2[3], p2[4], p2[5], p2[6]); bn.quaternion.copy(qa).slerp(qb, f);
  });
  RG.root.updateMatrixWorld(true);
};
RG.seek = function (t) { RG.time = clamp(t, 0, RG.duration); RG.sample(RG.time); V.requestRender(); };
RG.play = function (on) { RG.playing = on === undefined ? !RG.playing : on; if (RG.playing && RG.mode === 'edit') RG.setMode('pose'); F.ui && F.ui.refreshRig && F.ui.refreshRig(); };
RG.tick = function (dt) {
  if (!RG.playing || !RG.keys.length) return;
  RG.time += dt; if (RG.time > RG.duration) { if (RG.loop) RG.time = RG.time % Math.max(0.01, RG.duration); else { RG.time = RG.duration; RG.playing = false; } }
  RG.sample(RG.time); V.requestRender(); F.ui && F.ui.refreshTime && F.ui.refreshTime();
};
RG.clip = function () {
  if (!RG.keys.length) return null; const tracks = [], times = RG.keys.map(k => k.t);
  RG.bones.forEach(b => {
    const q = [], p = []; let moved = false; const f0 = RG.keys[0].pose[b.name];
    RG.keys.forEach(k => { const v = k.pose[b.name] || f0; if (!v) return; q.push(v[3], v[4], v[5], v[6]); p.push(v[0], v[1], v[2]); if (f0 && (Math.abs(v[0] - f0[0]) + Math.abs(v[1] - f0[1]) + Math.abs(v[2] - f0[2]) > 1e-6)) moved = true; });
    if (q.length) tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, q));
    if (moved) tracks.push(new THREE.VectorKeyframeTrack(b.name + '.position', times, p));
  });
  return new THREE.AnimationClip('Aktion', Math.max(RG.duration, times[times.length - 1]), tracks);
};

/* ---------- IK (CCD) ---------- */
RG.startIK = function () {
  if (!RG.sel) return F.say('Zuerst den Endknochen der Kette auswählen (z. B. Hand)', 'err');
  RG.stopIK(); RG.setMode('pose'); RG.ik.end = RG.sel; RG.ik.on = true;
  const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.05 * RG.size), new THREE.MeshBasicMaterial({ color: 0xff5d73, depthTest: false })); t.renderOrder = 70; t.userData.ik = true; t.userData.gizmoTarget = 'pivot';
  RG.sel.getWorldPosition(t.position); V.scene.add(t); RG.ik.target = t; RG.attachGizmo(); F.ui && F.ui.refreshRig && F.ui.refreshRig(); F.say('IK aktiv: rotes Ziel ziehen, die Kette folgt');
};
RG.stopIK = function () {
  if (RG.ik.target) { V.scene.remove(RG.ik.target); RG.ik.target = null; } RG.ik.on = false; RG.attachGizmo(); F.ui && F.ui.refreshRig && F.ui.refreshRig();
};
RG.solveIK = function () {
  const end = RG.ik.end, tgt = RG.ik.target; if (!end || !tgt) return;
  const chain = [end]; let b = end; for (let i = 0; i < RG.ik.len && b.parent && b.parent.isBone; i++) { b = b.parent; chain.push(b); }
  const ep = new THREE.Vector3(), jp = new THREE.Vector3(), tp = tgt.position.clone(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion();
  for (let it = 0; it < 14; it++) {
    for (let i = 1; i < chain.length; i++) {
      const bone = chain[i]; RG.root.updateMatrixWorld(true);
      end.getWorldPosition(ep); bone.getWorldPosition(jp); v1.subVectors(ep, jp); v2.subVectors(tp, jp);
      if (v1.lengthSq() < 1e-10 || v2.lengthSq() < 1e-10) continue; q.setFromUnitVectors(v1.normalize(), v2.normalize());
      bone.getWorldQuaternion(wq); wq.premultiply(q); (bone.parent ? bone.parent.getWorldQuaternion(pq) : pq.identity()); bone.quaternion.copy(pq.invert().multiply(wq));
    }
    RG.root.updateMatrixWorld(true); end.getWorldPosition(ep); if (ep.distanceToSquared(tp) < 1e-8) break;
  }
};

/* ---------- Vorlagen ---------- */
RG.preset = function (kind, n) {
  RG.clearAll(); const P = (x, y, z) => new THREE.Vector3(x, y, z); let b;
  if (kind === 'humanoid') {
    const hips = RG.addBone('Hips', P(0, 0.95, 0)), spine = RG.addBone('Spine', P(0, 1.1, 0), hips), chest = RG.addBone('Chest', P(0, 1.28, 0.0), spine), neck = RG.addBone('Neck', P(0, 1.5, 0), chest), head = RG.addBone('Head', P(0, 1.62, 0), neck); RG.addBone('Head_End', P(0, 1.82, 0), head);
    [['L', 1], ['R', -1]].forEach(([s, k]) => {
      const cl = RG.addBone('Clavicle_' + s, P(0.07 * k, 1.46, 0), chest), ua = RG.addBone('UpperArm_' + s, P(0.2 * k, 1.46, 0), cl), la = RG.addBone('LowerArm_' + s, P(0.48 * k, 1.46, 0), ua), ha = RG.addBone('Hand_' + s, P(0.74 * k, 1.46, 0), la); RG.addBone('Hand_End_' + s, P(0.88 * k, 1.46, 0), ha);
      const ul = RG.addBone('UpperLeg_' + s, P(0.1 * k, 0.92, 0), hips), ll = RG.addBone('LowerLeg_' + s, P(0.1 * k, 0.5, 0.01), ul), ft = RG.addBone('Foot_' + s, P(0.1 * k, 0.08, 0), ll); RG.addBone('Toe_' + s, P(0.1 * k, 0.03, 0.16), ft);
    });
  } else if (kind === 'arm') {
    const a = RG.addBone('Schulter', P(0, 1, 0)), b2 = RG.addBone('Oberarm', P(0.5, 1, 0), a), c = RG.addBone('Unterarm', P(1.0, 1, 0), b2); RG.addBone('Hand', P(1.35, 1, 0), c);
  } else { // Kette
    n = n || 6; let p = null; for (let i = 0; i <= n; i++) p = RG.addBone('Glied', P(0, i * (1.4 / n), 0), p);
  }
  RG.mode = 'edit'; RG.saveRest(); RG.select(RG.bones[0]); V.frame(); F.say(RG.bones.length + ' Knochen erzeugt');
};

/* ---------- Binden mit Auto-Gewichten ---------- */
RG.segments = function () {
  RG.root.updateMatrixWorld(true);
  return RG.bones.map(b => {
    const p = b.getWorldPosition(new THREE.Vector3()), segs = [], kids = RG.children(b);
    if (kids.length) kids.forEach(k => segs.push([p, k.getWorldPosition(new THREE.Vector3())]));
    else if (b.parent && b.parent.isBone) { const pp = b.parent.getWorldPosition(new THREE.Vector3()), d = p.clone().sub(pp).normalize().multiplyScalar(0.06 * RG.size); segs.push([p, p.clone().add(d)]); }
    else segs.push([p, p.clone().add(new THREE.Vector3(0, 0.1, 0))]);
    return segs;
  });
};
const segDist2 = (p, a, b) => { const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z, l2 = abx * abx + aby * aby + abz * abz; let t = l2 > 0 ? (apx * abx + apy * aby + apz * abz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t; return dx * dx + dy * dy + dz * dz; };
RG.weights = function (geo, sharp) {
  const segs = RG.segments(), pos = geo.attributes.position, n = pos.count, I4 = new Uint16Array(n * 4), W4 = new Float32Array(n * 4), v = new THREE.Vector3(), nb = RG.bones.length, d = new Float32Array(nb);
  sharp = sharp || 3;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    for (let k = 0; k < nb; k++) { let m = Infinity; for (const s of segs[k]) { const q = segDist2(v, s[0], s[1]); if (q < m) m = q; } d[k] = Math.sqrt(m); }
    // vier nächste Knochen
    const order = Array.from({ length: nb }, (_, k) => k).sort((a, b) => d[a] - d[b]).slice(0, 4), dmin = d[order[0]] + 1e-4; let sum = 0; const w = order.map(k => { const x = Math.pow(dmin / (d[k] + 1e-4), sharp * 2); sum += x; return x; });
    for (let k = 0; k < 4; k++) { if (k < order.length) { I4[i * 4 + k] = order[k]; W4[i * 4 + k] = w[k] / sum; } }
  }
  return { index: I4, weight: W4 };
};
RG.bind = function (mesh, sharp) {
  if (!RG.bones.length) return F.say('Zuerst Knochen anlegen (Vorlage oder Platzieren)', 'err');
  if (!mesh || !mesh.isMesh || mesh.isSkinnedMesh) return F.say('Bitte ein normales Mesh auswählen', 'err');
  if (RG.skeleton) return F.say('Es ist schon ein Mesh gebunden – zuerst lösen', 'err');
  RG.stopIK(); RG.resetPose(); RG.root.updateMatrixWorld(true); mesh.updateMatrixWorld(true);
  const geo = F.geo.plain(mesh.geometry); geo.applyMatrix4(mesh.matrixWorld);
  const w = RG.weights(geo, sharp);
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(w.index, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(w.weight, 4));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  const sm = new THREE.SkinnedMesh(geo, mesh.material); sm.name = mesh.name; sm.userData = JSON.parse(JSON.stringify(Object.assign({}, mesh.userData, { wire: null })));
  sm.userData.kind = 'skinned'; sm.userData.params = null; sm.frustumCulled = false;
  const sk = new THREE.Skeleton(RG.bones); RG.saveRest();
  V.replaceObject(mesh, sm, 'Rig binden'); sm.bind(sk, new THREE.Matrix4());
  RG.skeleton = sk; RG.mesh = sm; RG.mode = 'pose'; RG.attachGizmo(); F.ui && F.ui.refreshRig && F.ui.refreshRig();
  F.say('Gebunden: ' + F.geo.stats(geo).verts + ' Punkte, ' + RG.bones.length + ' Knochen. Jetzt Knochen drehen (Pose).');
  return sm;
};
RG.unbind = function (silent) {
  if (!RG.mesh) { RG.skeleton = null; return; }
  const sm = RG.mesh, g = sm.geometry.clone(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  const m = new THREE.Mesh(g, sm.material); m.name = sm.name; m.userData = Object.assign({}, sm.userData, { kind: 'mesh', wire: null }); m.userData.params = null;
  RG.resetPose(); V.replaceObject(sm, m, 'Rig lösen'); RG.skeleton = null; RG.mesh = null; F.ui && F.ui.refreshRig && F.ui.refreshRig();
  if (!silent) F.say('Mesh vom Skelett gelöst (Rest-Pose)');
};

/* ---------- Werkzeug: Knochen wählen / platzieren ---------- */
F.tools.bone = {
  cursor: 'crosshair',
  enter() { }, leave() { },
  down(e) {
    if (RG.mode === 'pose' && !RG.place) { return pickJoint(e); }
    if (RG.place && RG.mode === 'edit') {
      const r = V.ray(e); let pt = null; const hit = r.intersectObjects(V.objects().filter(o => o.visible), false)[0];
      if (hit) pt = hit.point.clone();
      else {
        const anchor = RG.sel ? RG.sel.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(); const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(V.cam.getWorldDirection(new THREE.Vector3()), anchor);
        pt = new THREE.Vector3(); if (!r.ray.intersectPlane(pl, pt)) return false;
      }
      const j = pickJointOnly(e); if (j) { RG.select(j); return true; }
      const b = RG.addBone(RG.sel ? 'Knochen' : 'Wurzel', pt, RG.sel || null); RG.select(b); return true;
    }
    return pickJoint(e);
  },
  up() { }
};
function pickJointOnly(e) { const h = V.ray(e).intersectObjects(RG.joints, false)[0]; return h ? h.object.userData.bone : null; }
function pickJoint(e) { const b = pickJointOnly(e); if (b) { RG.select(b); return true; } return false; }
