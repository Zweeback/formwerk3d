/* ============================================================
   Oberfläche: Modi, Panels, Objektliste, Eigenschaften
   ============================================================ */
const UI = F.ui = { tb: {}, panelBusy: false };
const E_ = F.edit, K_ = F.sculpt, PT_ = F.paint, RG_ = F.rig, SK_ = F.sketch, MP_ = F.map;
const MODES = [['object', 'Objekt'], ['cad', 'CAD'], ['edit', 'Mesh'], ['sculpt', 'Sculpt'], ['paint', 'Textur'], ['rig', 'Rig'], ['map', 'Karte'], ['photo', 'Foto'], ['code', 'Export']];
const OBJMODES = ['object', 'cad', 'map', 'photo', 'code'];
V.objMode = () => OBJMODES.indexOf(S.mode) >= 0;

/* ---------- kleine Bausteine ---------- */
const btn = (t, fn, o) => { o = o || {}; return h('button', { type: 'button', class: 'btn' + (o.cls ? ' ' + o.cls : ''), title: o.title, 'aria-pressed': o.pressed === undefined ? undefined : String(!!o.pressed), disabled: o.disabled, onclick: fn }, t); };
const sec = (title, ...kids) => h('section', { class: 'sec' }, title ? h('h3', { text: title }) : null, ...kids);
const row = (...k) => h('div', { class: 'row' }, ...k);
const hint = t => h('p', { class: 'hint', html: t });
const fld = (label, input) => h('label', { class: 'fld' }, h('span', { text: label, title: label }), input);
const numIn = (v, o, fn) => h('input', { type: 'number', step: o.step || 0.1, min: o.min, max: o.max, value: fix(v, 4), onchange: e => { let n = parseFloat(e.target.value); if (!isFinite(n)) return; if (o.min !== undefined) n = Math.max(o.min, n); if (o.max !== undefined) n = Math.min(o.max, n); if (o.int) n = Math.round(n); e.target.value = n; fn(n); } });
const selIn = (opts, cur, fn) => h('select', { onchange: e => fn(e.target.value) }, opts.map(o => { const a = Array.isArray(o) ? o : [o, o]; return h('option', { value: a[0], selected: String(a[0]) === String(cur) ? true : undefined }, a[1]); }));
const chk = (label, v, fn) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!v, onchange: e => fn(e.target.checked) }), h('span', { text: label }));
const rng = (label, v, min, max, step, fn, fmt) => {
  const f = fmt || (x => String(fix(x, 3))), out = h('span', { class: 'mono', text: f(v) });
  return h('label', { class: 'fld col' }, h('span', { class: 'row' }, h('span', { class: 'grow', text: label }), out), h('input', { type: 'range', min, max, step, value: v, oninput: e => { const n = parseFloat(e.target.value); out.textContent = f(n); fn(n); } }));
};
const IMPORT_ACCEPT = '.glb,.gltf,.vrm,.fbx,.obj,.dae,.stl,.ply,.3ds,.3mf,.zip,.splat,.las,.pcd,.xyz,.pts,.csv,.json,.geojson,.txt,.jpg,.jpeg,.png,.webp';
const importBtn = (label, o) => {
  const inp = h('input', { type: 'file', accept: IMPORT_ACCEPT, multiple: true, hidden: true, onchange: e => { const fs = e.target.files; if (fs && fs.length) F.exp.importFiles(fs).then(() => UI.drawPanel(true)); e.target.value = ''; } });
  return h('span', null, inp, btn(label, () => inp.click(), o));
};
const fileBtn = (label, accept, fn, o) => {
  const inp = h('input', { type: 'file', accept, hidden: true, onchange: e => { const f = e.target.files && e.target.files[0]; if (f) fn(f); e.target.value = ''; } });
  return h('span', null, inp, btn(label, () => inp.click(), o));
};
const safe = fn => function () { try { return fn.apply(this, arguments); } catch (e) { F.say(e && e.message ? e.message : String(e), 'err'); console.error(e); } };

/* ---------- Aufbau ---------- */
UI.build = function () {
  const nav = $('#modes');
  MODES.forEach(([id, label]) => nav.append(h('button', { class: 'mode', role: 'tab', type: 'button', 'data-m': id, 'aria-selected': 'false', onclick: () => UI.setMode(id) }, label)));
  const top = $('#tools-top');
  UI.tb.undo = btn('↶ Zurück', () => UI.undo(), { title: 'Rückgängig (Strg+Z)' }); UI.tb.redo = btn('↷ Wieder', () => UI.redo(), { title: 'Wiederholen (Strg+Y)' });
  const scene = h('select', { title: 'Szene', onchange: e => { const v = e.target.value; e.target.selectedIndex = 0; UI.sceneAction(v); } },
    h('option', { value: '' }, 'Szene …'), h('option', { value: 'new' }, 'Neu (leer)'), h('option', { value: 'demo' }, 'Beispiel: Lagerblock, Zahnrad, Kugel'), h('option', { value: 'city' }, 'Beispiel: Stadt aus Kartendaten'), h('option', { value: 'rig' }, 'Beispiel: Figur mit Skelett'), h('option', { value: 'rtw' }, 'Referenz: Rettungswagen (VW LT, über 80.000 Dreiecke)'), h('option', { value: 'scan' }, 'Demo: Foto-Scanner (Rettungswagen → 20 Fotos → Modell)'), h('option', { value: 'restore' }, 'Letzte Sitzung laden'));
  scene.style.width = 'auto';
  top.append(UI.tb.undo, UI.tb.redo, scene, btn('Bild', () => F.snapshotView(), { title: 'Bild der Ansicht erzeugen (kopieren oder speichern)' }), importBtn('Importieren', { cls: 'pri', title: 'Alles laden: GLB, FBX, VRM, OBJ, ZIP, Splats, Punktwolken, Fotos (auch mehrere Dateien, oder einfach ins Fenster ziehen)' }), btn('Hilfe', () => UI.help(true)), UI.tb.theme = btn('Thema', () => UI.cycleTheme(), { title: 'Hell / Dunkel / System' }));

  const tl = $('#ov-tl'), seg = h('div', { class: 'seg' });
  [['front', 'Vorn'], ['back', 'Hinten'], ['left', 'Links'], ['right', 'Rechts'], ['top', 'Oben'], ['bottom', 'Unten'], ['iso', 'Iso']].forEach(([k, l]) => seg.append(btn(l, () => V.viewDir(k), { cls: 'sm' })));
  tl.append(seg, UI.tb.ortho = btn('Ortho', () => V.setOrtho(!S.ortho), { cls: 'sm', title: 'Orthografisch (5)' }), btn('Alles zeigen', () => V.frame(), { cls: 'sm', title: 'Home' }));
  const tr = $('#ov-tr'), sh = h('div', { class: 'seg' }); UI.tb.shade = {};
  [['solid', 'Fläche'], ['wire', 'Draht'], ['solidwire', 'Fläche+Draht'], ['xray', 'Röntgen']].forEach(([k, l]) => { UI.tb.shade[k] = btn(l, () => V.setShading(k), { cls: 'sm' }); sh.append(UI.tb.shade[k]); });
  tr.append(sh, UI.tb.snap = btn('Raster-Fang', () => { S.snap = !S.snap; V.syncGizmo(); UI.refreshToolbar(); }, { cls: 'sm', title: 'Verschieben 0,25 m · Drehen 15° · Skalieren 0,1' }));
  const bl = $('#ov-bl'), gz = h('div', { class: 'seg' }); UI.tb.gizmo = {}; UI.tb.gz = gz;
  [['translate', 'Bewegen (G)'], ['rotate', 'Drehen (R)'], ['scale', 'Skalieren (S)']].forEach(([k, l]) => { UI.tb.gizmo[k] = btn(l, () => V.setGizmo(k), { cls: 'sm' }); gz.append(UI.tb.gizmo[k]); });
  bl.append(gz);
  const pal = $('#palette'); Object.keys(F.prims).forEach(k => pal.append(btn(F.prims[k].label, () => V.add(k), { cls: 'sm', title: F.prims[k].label + ' hinzufügen' })));
  $('#pane-close').addEventListener('click', () => { if (S.mode === 'paint' || S.mode === 'photo') UI.setMode('object'); else UI.closeSketch(); });
  /* Dateien ins Fenster ziehen */
  const wrap = $('#vpwrap'); let dragDepth = 0; const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0;
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => { if (hasFiles(e)) e.preventDefault(); });
  wrap.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; wrap.classList.add('drop'); } });
  wrap.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; wrap.classList.remove('drop'); } });
  wrap.addEventListener('drop', e => { dragDepth = 0; wrap.classList.remove('drop'); if (hasFiles(e) && e.dataTransfer.files.length) F.exp.importFiles(e.dataTransfer.files).then(() => UI.drawPanel(true)); });
  UI.refreshToolbar(); UI.refreshHistory(); UI.drawOutliner(); UI.drawInspector();
};

/* ---------- Modi ---------- */
UI.setMode = function (m, quiet) {
  if (m === S.mode) return; const prev = S.mode;
  if (m === 'edit' && !(S.active && S.active.isMesh && !S.active.isSkinnedMesh)) return F.say('Zuerst ein normales Mesh auswählen', 'err');
  if (m === 'sculpt' && !(S.active && S.active.isMesh && !S.active.isSkinnedMesh)) return F.say('Zuerst ein normales Mesh auswählen', 'err');
  if (prev === 'edit') E_.leave();
  if (prev === 'rig') { RG_.stopIK(); RG_.place = false; if (V.tc.object) V.tc.detach(); }
  if (prev === 'paint' || prev === 'photo' || (prev === 'cad' && m !== 'cad')) { if (P2.editor) P2.use(null); }
  V.setTool('select');
  S.mode = m;
  if (m === 'edit') { if (!E_.enter(S.active)) { S.mode = prev; return UI.setMode(prev === 'edit' ? 'object' : prev, true); } V.setTool('vertex'); }
  else if (m === 'sculpt') { if (!K_.ready(S.active)) { S.mode = 'object'; } else V.setTool('sculpt'); }
  else if (m === 'paint') { P2.use(F.paintEditor, 'Textur-Studio'); if (PT_.paint3d) V.setTool('paint3d'); }
  else if (m === 'photo') P2.use(F.photoEditor, 'Foto-Studio');
  else if (m === 'rig') { V.setTool('bone'); RG_.attachGizmo(); if (V.tc.object) V.tc.visible = true; }
  if (m !== 'rig' && m !== 'edit') V.syncGizmo();
  UI.afterMode();
};
UI.afterMode = function () {
  RG_.syncVis(); document.body.dataset.mode = S.mode; $$('.mode').forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === S.mode)));
  UI.refreshToolbar(); UI.drawPanel(true); UI.drawInspector(); V.refreshAll();
};
UI.closeSketch = function () { if (P2.editor) P2.use(null); UI.drawPanel(true); };
UI.undo = function () { if (S.mode === 'paint' && PT_.undo()) return; F.history.back(); };
UI.redo = function () { F.history.forward(); };

/* ---------- Hooks, die andere Module aufrufen ---------- */
let rafAll = 0;
UI.refreshAll = function () {
  if (rafAll) return; rafAll = requestAnimationFrame(() => {
    rafAll = 0;
    if (UI.guard) return; UI.guard = true;
    try {
      if (S.mode === 'sculpt' && S.active !== K_.obj) { if (S.active && S.active.isMesh && !S.active.isSkinnedMesh && K_.ready(S.active)) { /* Wechsel */ } else UI.setMode('object'); }
      if (S.mode === 'edit' && S.active !== E_.obj) { if (S.active && S.active.isMesh && !S.active.isSkinnedMesh) E_.enter(S.active); else UI.setMode('object'); }
    } catch (e) { console.warn(e); }
    UI.guard = false;
    UI.drawOutliner(); UI.drawInspector(); UI.drawPanel(false); UI.drawStats(); UI.autosave();
  });
};
UI.drawStats = function () { const s = V.stats(), el = $('#stats'); if (el) el.textContent = s.objects + ' Obj · ' + s.verts.toLocaleString('de-DE') + ' Pkt · ' + s.tris.toLocaleString('de-DE') + ' Dr'; };
UI.refreshToolbar = function () {
  if (!UI.tb.ortho) return;
  UI.tb.ortho.setAttribute('aria-pressed', String(!!S.ortho)); UI.tb.snap.setAttribute('aria-pressed', String(!!S.snap));
  Object.keys(UI.tb.shade).forEach(k => UI.tb.shade[k].setAttribute('aria-pressed', String(S.shading === k)));
  Object.keys(UI.tb.gizmo).forEach(k => UI.tb.gizmo[k].setAttribute('aria-pressed', String(S.gizmo === k)));
  UI.tb.gz.style.display = (V.objMode() || S.mode === 'rig') ? '' : 'none';
};
UI.refreshHistory = function () {
  if (!UI.tb.undo) return; const H_ = F.history, u = H_.undo[H_.undo.length - 1], r = H_.redo[H_.redo.length - 1];
  UI.tb.undo.disabled = !u && S.mode !== 'paint'; UI.tb.redo.disabled = !r; UI.tb.undo.title = u ? 'Rückgängig: ' + u.label + ' (Strg+Z)' : 'Rückgängig (Strg+Z)'; UI.tb.redo.title = r ? 'Wiederholen: ' + r.label + ' (Strg+Y)' : 'Wiederholen (Strg+Y)';
};
UI.refreshTransform = function () {
  const o = S.active, t = UI.tf; if (!o || !t || o.parent !== V.world) return;
  const p = o.position.toArray(), r = [o.rotation.x / DEG, o.rotation.y / DEG, o.rotation.z / DEG], s = o.scale.toArray();
  [['pos', p], ['rot', r], ['scale', s]].forEach(([k, a]) => t[k] && t[k].forEach((i, n) => { if (document.activeElement !== i) i.value = fix(a[n], k === 'rot' ? 2 : 4); }));
};
UI.refreshEdit = function () { const c = $('#edit-count'); if (c) c.textContent = E_.sel.size + ' von ' + E_.groups.length + ' Punkten gewählt'; };
UI.refreshSketch = function () { if (S.mode === 'cad') UI.drawPanel(false); };
UI.refreshPaint = function () { if (S.mode === 'paint') UI.drawPanel(true); };
UI.refreshRig = function (light) { if (S.mode !== 'rig') return; if (light) { UI.refreshBoneFields(); return; } UI.drawPanel(true); };
UI.refreshTime = function () { const s = $('#tl-time'), l = $('#tl-label'); if (s) s.value = RG_.time; if (l) l.textContent = fix(RG_.time, 2) + ' s'; };

/* ---------- Objektliste ---------- */
UI.drawOutliner = function () {
  const box = $('#outliner'); if (!box) return; box.textContent = ''; const objs = V.objects();
  if (!objs.length) { box.append(h('div', { class: 'empty', text: 'Noch leer. Unten ein Objekt wählen oder über „Szene …“ ein Beispiel laden.' })); return; }
  objs.forEach(o => box.append(h('div', { class: 'ol' + (S.sel.indexOf(o) >= 0 ? ' sel' : ''), onclick: e => V.select(o, e.shiftKey || e.ctrlKey || e.metaKey) },
    h('button', { class: 'eye', type: 'button', title: 'Sichtbar / unsichtbar', 'aria-pressed': String(o.visible), onclick: e => { e.stopPropagation(); o.visible = !o.visible; V.requestRender(); UI.drawOutliner(); UI.drawStats(); } }, o.visible ? '●' : '○'),
    h('span', { class: 'nm', text: o.name, title: o.name }), o.isSkinnedMesh ? h('span', { class: 'badge', text: 'Rig' }) : null)));
};

/* ---------- Eigenschaften (Transform & Material) ---------- */
UI.drawInspector = function () {
  const box = $('#inspector'); if (!box) return; box.textContent = ''; UI.tf = null; const o = S.active;
  if (!(V.objMode()) || !o || o.parent !== V.world) { box.hidden = true; return; } box.hidden = false;
  const m = o.material, tf = UI.tf = { pos: [], rot: [], scale: [] };
  const xyz = (key, vals, step, label) => h('div', { class: 'fld col' }, h('span', { text: label, class: 'hint' }), h('div', { class: 'xyz' }, vals.map((v, i) => { const inp = numIn(v, { step }, safe(n => { const a = key === 'pos' ? o.position.toArray() : key === 'rot' ? [o.rotation.x / DEG, o.rotation.y / DEG, o.rotation.z / DEG] : o.scale.toArray(); a[i] = n; V.setTransform(o, { [key]: a }); })); tf[key].push(inp); return inp; })));
  box.append(
    sec('Eigenschaften',
      fld('Name', h('input', { type: 'text', value: o.name, onchange: e => { const n = e.target.value.trim(); if (n) { o.name = n; UI.drawOutliner(); } } })),
      xyz('pos', o.position.toArray(), 0.1, 'Position (m)'), xyz('rot', [o.rotation.x / DEG, o.rotation.y / DEG, o.rotation.z / DEG], 5, 'Drehung (°)'), xyz('scale', o.scale.toArray(), 0.1, 'Skalierung')),
    sec('Material',
      fld('Farbe', h('input', { type: 'color', value: F.hex(m.color), oninput: e => { m.color.set(e.target.value); V.requestRender(); } })),
      rng('Rauheit', m.roughness === undefined ? 0.6 : m.roughness, 0, 1, 0.01, n => { m.roughness = n; V.requestRender(); }),
      rng('Metall', m.metalness || 0, 0, 1, 0.01, n => { m.metalness = n; V.requestRender(); }),
      rng('Deckkraft', m.userData.opacity === undefined ? 1 : m.userData.opacity, 0.05, 1, 0.01, n => { m.userData.opacity = n; V.applyDisplay(o); V.requestRender(); }),
      chk('Beidseitig sichtbar', m.side === THREE.DoubleSide, v => { m.side = v ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true; V.requestRender(); })));
};

/* ---------- Panel je Modus ---------- */
UI.drawPanel = function (force) {
  const box = $('#panel'); if (!box) return;
  if (!force && box.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const scroll = box.parentElement ? box.parentElement.scrollTop : 0; box.textContent = '';
  try { (UI.panels[S.mode] || (() => { }))(box); } catch (e) { console.error(e); box.append(h('div', { class: 'empty', text: 'Panel-Fehler: ' + e.message })); }
  if (box.parentElement) box.parentElement.scrollTop = scroll;
};
UI.panels = {};
const active = () => { const o = S.active; return o && o.isMesh && o.parent === V.world ? o : null; };
const needMesh = () => { const o = active(); if (!o) { F.say('Zuerst ein Objekt auswählen', 'err'); return null; } if (o.isSkinnedMesh) { F.say('Geriggte Meshes lassen sich nicht verformen – zuerst im Rig-Modus lösen', 'err'); return null; } return o; };
function geoOp(label, fn) { const o = needMesh(); if (!o) return; try { const g = fn(o); if (g) V.setGeometry(o, g, label, 'mesh', null); o.userData.sculpt = false; F.say(label + ': ' + F.geo.stats(o.geometry).tris + ' Dreiecke'); } catch (e) { F.say(label + ' fehlgeschlagen: ' + e.message, 'err'); } }

let decPct = 50;
/* ----- Objekt ----- */
UI.panels.object = function (box) {
  const n = S.sel.length;
  box.append(
    sec('Auswahl', hint(n ? '<b>' + n + '</b> Objekt' + (n > 1 ? 'e' : '') + ' gewählt. Klick im Fenster wählt, Shift+Klick ergänzt. Pfeile am Werkzeug bewegen, drehen oder skalieren.' : 'Nichts gewählt. Klick auf ein Objekt im Fenster oder in der Liste.'),
      row(btn('Duplizieren', () => V.duplicate(), { cls: 'sm', disabled: !n }), btn('Löschen', () => V.remove(), { cls: 'sm dng', disabled: !n }), btn('Fokus', () => V.focusSel(), { cls: 'sm' }), btn('Alle', () => { const all = V.objects().filter(o => o.visible); all.forEach((o, i) => V.select(o, i > 0)); }, { cls: 'sm' }))),
    sec('Objekt bearbeiten',
      row(btn('Zusammenführen', safe(() => UI.join()), { cls: 'sm', title: 'Gewählte Objekte zu einem Mesh verbinden' }), btn('Transform einbacken', safe(() => UI.bakeTransform()), { cls: 'sm', title: 'Position/Drehung/Skalierung in die Geometrie schreiben' })),
      row(btn('Ursprung → Mitte', safe(() => UI.recenter('center')), { cls: 'sm' }), btn('Ursprung → Unten', safe(() => UI.recenter('bottom')), { cls: 'sm' })),
      row(btn('Auf Boden setzen', safe(() => { S.sel.forEach(o => { const b = new THREE.Box3().setFromObject(o); V.setTransform(o, { pos: [o.position.x, o.position.y - b.min.y, o.position.z] }); }); }), { cls: 'sm' }))),
    sec('Zum Weiterarbeiten', hint('<b>CAD</b>: Boolesche Operationen, Skizze, Extrusion. <b>Mesh</b>: Punkte formen. <b>Sculpt</b>: Pinsel. <b>Textur</b>: malen. <b>Rig</b>: Knochen. <b>Karte</b>: Stadt aus Kartendaten. <b>Export</b>: C++, Unity, Unreal, glTF.')));
};
UI.join = function () {
  const l = S.sel.filter(o => o.isMesh && !o.isSkinnedMesh); if (l.length < 2) return F.say('Mindestens zwei Meshes wählen', 'err');
  const g = F.geo.joined(l), m = V.addMesh(g, { name: l[0].name + ' (vereint)', kind: 'mesh', dropToGrid: false, position: [0, 0, 0], silent: true, material: l[0].material.clone() });
  l.forEach(o => V._detach(o)); V.select(m);
  F.history.push('Zusammenführen', () => { V._detach(m); l.forEach(o => V._attach(o)); }, () => { l.forEach(o => V._detach(o)); V._attach(m); }); V.refreshAll();
};
UI.bakeTransform = function () {
  const l = S.sel.filter(o => o.isMesh && !o.isSkinnedMesh); if (!l.length) return F.say('Zuerst ein Objekt auswählen', 'err');
  l.forEach(o => { o.updateMatrix(); const g = o.geometry.clone().applyMatrix4(o.matrix); V.setGeometry(o, g, 'Transform einbacken', 'mesh', null); const p = o.position.clone(), q = o.quaternion.clone(), s = o.scale.clone(); o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); F.history.push('Transform zurücksetzen', () => { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }, () => { o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); }); });
  V.refreshAll(); F.say('Transform eingebacken');
};
UI.recenter = function (mode) {
  const l = S.sel.filter(o => o.isMesh && !o.isSkinnedMesh); if (!l.length) return F.say('Zuerst ein Objekt auswählen', 'err');
  l.forEach(o => { const g0 = o.geometry, g = g0.clone(), p0 = o.position.clone(); const tmp = new THREE.Mesh(g); tmp.position.copy(o.position); tmp.quaternion.copy(o.quaternion); tmp.scale.copy(o.scale); F.geo.recenter(tmp, mode); const p1 = tmp.position.clone(); V.setGeometry(o, g, 'Ursprung', o.userData.kind === 'csg' ? 'csg' : 'mesh', null); o.position.copy(p1); F.history.push('Ursprung verschieben', () => o.position.copy(p0), () => o.position.copy(p1)); });
  V.refreshAll();
};

/* ----- CAD ----- */
let cadKeep = false, skD = 1, skBev = 0, skPlane = 'xy', skSeg = 48, skAng = 360, bgW = 100, mirAxis = 0, mirCut = false, arrN = 3, arrOff = [1.2, 0, 0], shellT = 0.05, defAmt = 45, subdivKind = 'loop';
UI.boolean = function (op) {
  if (S.sel.length < 2) return F.say('Zwei Objekte wählen: zuerst A, dann B (Shift+Klick)', 'err');
  const A = S.sel[0], B = S.sel[1]; if (A.isSkinnedMesh || B.isSkinnedMesh) return F.say('Geriggte Meshes sind für Boolesche Operationen gesperrt', 'err');
  let geo; try { geo = F.csg.run(op, A, B); } catch (e) { return F.say(e instanceof RangeError || /Dreieck/.test(e.message) ? e.message : 'Boolesche Operation fehlgeschlagen: ' + e.message, 'err'); }
  if (!geo.attributes.position.count) return F.say('Ergebnis ist leer – überlappen sich die Objekte?', 'err');
  const sym = { union: ' + ', subtract: ' − ', intersect: ' ∩ ' }[op], res = V.addMesh(geo, { name: A.name + sym + B.name, kind: 'csg', dropToGrid: false, position: [0, 0, 0], silent: true, material: A.material.clone() });
  res.material.userData = Object.assign({}, A.material.userData); const vis = [A.visible, B.visible];
  if (cadKeep) { A.visible = false; B.visible = false; } else { V._detach(A); V._detach(B); }
  V.select(res);
  F.history.push('Boolesch: ' + op, () => { V._detach(res); if (cadKeep) { A.visible = vis[0]; B.visible = vis[1]; } else { V._attach(A); V._attach(B); } }, () => { if (cadKeep) { A.visible = false; B.visible = false; } else { V._detach(A); V._detach(B); } V._attach(res); });
  V.refreshAll(); F.say('Ergebnis: ' + F.geo.stats(geo).tris + ' Dreiecke');
};
UI.panels.cad = function (box) {
  const o = active(), P = o && F.prims[o.userData.kind] && o.userData.params ? F.prims[o.userData.kind] : null;
  if (P) {
    box.append(sec('Parameter · ' + P.label, ...P.f.map(f => fld(f[1], numIn(o.userData.params[f[0]], f[2] || {}, safe(n => { const p = Object.assign({}, o.userData.params, { [f[0]]: n }), b = V.build(o.userData.kind, p); V.setGeometry(o, b.geo, 'Parameter', o.userData.kind, b.params); }))))));
  } else if (o) box.append(sec('Parameter', hint('„' + o.name + '“ ist kein parametrisches Grundkörper-Objekt (z. B. Ergebnis einer Booleschen Operation) – Form per Skalieren oder mit den Werkzeugen unten ändern.')));
  box.append(
    sec('Boolesche Operationen',
      hint('<b>A</b> = zuerst gewählt, <b>B</b> = danach (Shift+Klick). Differenz bohrt B aus A.' + (S.sel.length >= 2 ? ' Aktuell: <b>' + S.sel[0].name + '</b> / <b>' + S.sel[1].name + '</b>' : '')),
      row(btn('A ∪ B', () => UI.boolean('union'), { cls: 'sm', title: 'Vereinigung' }), btn('A − B', () => UI.boolean('subtract'), { cls: 'sm pri', title: 'Differenz' }), btn('A ∩ B', () => UI.boolean('intersect'), { cls: 'sm', title: 'Schnitt' })),
      chk('Originale behalten (ausblenden)', cadKeep, v => cadKeep = v)),
    sec('Skizze → Körper',
      row(btn(P2.editor === SK_ ? 'Skizzenfläche schließen' : 'Skizzenfläche öffnen', () => { if (P2.editor === SK_) P2.use(null); else P2.use(SK_, 'Skizze'); UI.drawPanel(true); }, { cls: 'sm pri' }), selIn([['', 'Vorlage …'], ['rect', 'Rechteck'], ['circle', 'Kreis'], ['ring', 'Ring'], ['lprofil', 'L-Profil'], ['star', 'Stern'], ['haus', 'Grundriss'], ['vase', 'Vase (Profil)']], '', v => { if (v) { if (P2.editor !== SK_) P2.use(SK_, 'Skizze'); SK_.template(v); UI.drawPanel(true); } })),
      row(btn('Kontur schließen', () => SK_.close(), { cls: 'sm' }), btn('Neue Kontur', () => SK_.newLoop(false), { cls: 'sm' }), btn('Loch', () => SK_.newLoop(true), { cls: 'sm' }), btn('Punkt zurück', () => SK_.undoPoint(), { cls: 'sm' }), btn('Leeren', () => SK_.clear(), { cls: 'sm dng' })),
      fld('Raster', selIn([[0, 'frei'], [0.05, '5 cm'], [0.1, '10 cm'], [0.25, '25 cm'], [0.5, '50 cm'], [1, '1 m'], [5, '5 m']], SK_.snap, v => { SK_.snap = parseFloat(v); P2.redraw(); })),
      hint('Klick setzt Punkte, Doppelklick schließt. x/y in Metern. Rechte Maustaste verschiebt, Rad zoomt.'),
      fld('Tiefe (m)', numIn(skD, { step: 0.1, min: 0.001 }, v => skD = v)), fld('Fase (m)', numIn(skBev, { step: 0.01, min: 0 }, v => skBev = v)), fld('Ebene', selIn([['xy', 'stehend (XY)'], ['xz', 'liegend (Grundriss)']], skPlane, v => skPlane = v)),
      row(btn('Extrudieren', safe(() => { SK_.extrude(skD, skBev, skPlane); }), { cls: 'sm pri' })),
      fld('Segmente', numIn(skSeg, { step: 1, min: 3, int: true }, v => skSeg = v)), fld('Winkel (°)', numIn(skAng, { step: 15, min: 10, max: 360 }, v => skAng = v)),
      row(btn('Drehen (Profil, x = Radius)', safe(() => { SK_.lathe(skSeg, skAng); }), { cls: 'sm pri' }))),
    sec('Karte nachzeichnen',
      hint('Screenshot einer Karte als Referenz laden und Grundrisse nachzeichnen. Breite = Länge des Bildausschnitts in Metern (Maßstab).'),
      row(fileBtn('Referenzbild …', 'image/*', f => { if (P2.editor !== SK_) P2.use(SK_, 'Skizze'); SK_.setBackground(f, bgW); }, { cls: 'sm' }), h('span', { class: 'grow' }, numIn(bgW, { step: 10, min: 0.5 }, v => { bgW = v; if (SK_.bg) { SK_.bg.wm = v; P2.redraw(); } })), h('span', { class: 'hint', text: 'm' }))),
    sec('Formen & Modifikatoren',
      hint(o ? 'Wirkt auf <b>' + o.name + '</b>. Verformen braucht genug Segmente.' : 'Zuerst ein Objekt wählen.'),
      row(selIn([[0, 'Spiegeln an X'], [1, 'Spiegeln an Y'], [2, 'Spiegeln an Z']], mirAxis, v => mirAxis = parseInt(v)), chk('Hälfte abschneiden', mirCut, v => mirCut = v), btn('Spiegeln', () => geoOp('Spiegeln', ob => F.geo.mirror(ob.geometry, mirAxis, mirCut)), { cls: 'sm' })),
      row(h('span', { class: 'grow' }, numIn(arrN, { step: 1, min: 2, max: 60, int: true }, v => arrN = v)), btn('Reihe', () => geoOp('Reihe', ob => F.geo.array(ob.geometry, arrN, arrOff)), { cls: 'sm' })),
      h('div', { class: 'xyz' }, [0, 1, 2].map(i => numIn(arrOff[i], { step: 0.1 }, v => arrOff[i] = v))), hint('Abstand der Reihe in x / y / z (m, lokal)'),
      row(h('span', { class: 'grow' }, numIn(shellT, { step: 0.01, min: 0.002 }, v => shellT = v)), btn('Hohlkörper', () => geoOp('Hohlkörper', ob => F.geo.shell(ob.geometry, shellT)), { cls: 'sm' })),
      row(h('span', { class: 'grow' }, numIn(decPct, { step: 5, min: 2, max: 95, int: true }, v => decPct = v)), h('span', { class: 'hint', text: '% der Dreiecke' }), btn('Vereinfachen', () => geoOp('Vereinfachen', ob => F.geo.decimate(ob.geometry, decPct / 100)), { cls: 'sm', title: 'Weniger Dreiecke (für Spiele, Scans, Export). Texturkoordinaten gehen dabei verloren.' })),
      fld('Stärke (°/Faktor)', numIn(defAmt, { step: 5 }, v => defAmt = v)),
      row(['twist', 'taper', 'bend'].map(k => btn({ twist: 'Verdrehen', taper: 'Verjüngen', bend: 'Biegen' }[k], () => geoOp({ twist: 'Verdrehen', taper: 'Verjüngen', bend: 'Biegen' }[k], ob => { const g = F.geo.plain(ob.geometry); F.geo.deform(g, k, k === 'taper' ? defAmt / 100 : defAmt); return g; }), { cls: 'sm' }))),
      hint('Verjüngen: Stärke in Prozent (45 = Spitze 45 % kleiner). Achse = Y des Objekts.')),
    sec('Messen',
      row(btn('Abstand messen', () => { V.setTool(S.tool === 'measure' ? 'select' : 'measure'); UI.drawPanel(true); }, { cls: 'sm', pressed: S.tool === 'measure' }), btn('Messung löschen', () => F.measure.clear(), { cls: 'sm' })),
      hint('Zwei Punkte auf der Oberfläche anklicken, der Abstand erscheint in Metern.')));
};

/* ----- Mesh (Punktbearbeitung) ----- */
let nudge = 0.1, smoothIt = 2, subIt = 1, smoothLam = 0.5, exAmt = 0.2, inAmt = 0.1, mgDist = 0.02, lcAxis = 'y', lcN = 1;
UI.panels.edit = function (box) {
  const o = E_.obj;
  box.append(
    sec('Punkte · ' + (o ? o.name : '—'), h('p', { class: 'hint', id: 'edit-count', text: E_.sel.size + ' von ' + E_.groups.length + ' Punkten gewählt' }),
      hint('Ziehen im Fenster = Rechteckauswahl (Shift ergänzt). Danach mit dem Werkzeug bewegen, drehen oder skalieren. Alt oder rechte Maustaste dreht die Ansicht.'),
      row(btn('Alle', () => E_.selectAll(), { cls: 'sm' }), btn('Keine', () => E_.selectNone(), { cls: 'sm' }), btn('Umkehren', () => E_.invert(), { cls: 'sm' }), btn('Erweitern', () => E_.grow(), { cls: 'sm' })),
      chk('Röntgen (auch verdeckte Punkte)', E_.xray, v => { E_.xray = v; if (E_.pts) { E_.pts.material.depthTest = !v; E_.pts.material.needsUpdate = true; V.requestRender(); } }),
      chk('Mit Linker Maustaste drehen', E_.nav, v => E_.nav = v)),
    sec('Weiche Auswahl',
      chk('Proportionale Bearbeitung', E_.prop.on, v => { E_.prop.on = v; }),
      rng('Radius (m)', E_.prop.radius, 0.05, 4, 0.05, n => E_.prop.radius = n)),
    sec('Auswahl formen',
      rng('Entlang Normale (m)', nudge, -1, 1, 0.01, n => nudge = n), row(btn('Anwenden', () => E_.nudge(nudge), { cls: 'sm pri' })),
      rng('Glätten (Durchgänge)', smoothIt, 1, 20, 1, n => smoothIt = n, x => String(x)), row(btn('Auswahl glätten', () => E_.smoothSel(smoothIt), { cls: 'sm' }))),
    sec('Flächen bearbeiten',
      hint('Wirkt auf alle Dreiecke, deren drei Punkte gewählt sind (Röntgen einschalten, Rahmen um die Fläche ziehen). Tasche: erst Einsetzen, dann negativ Extrudieren.'),
      rng('Extrudieren (m)', exAmt, -2, 2, 0.01, n => exAmt = n), row(btn('Extrudieren', () => UI.meshop({ op: 'extrude', amount: exAmt }, 'Extrudieren'), { cls: 'sm pri' })),
      rng('Einsetzen / Fase (m)', inAmt, 0.005, 1, 0.005, n => inAmt = n), row(btn('Einsetzen', () => UI.meshop({ op: 'inset', amount: inAmt }, 'Einsetzen'), { cls: 'sm' }), btn('Fase', () => UI.meshop({ op: 'fase', amount: inAmt }, 'Fase'), { cls: 'sm', title: 'Schrägt den Rand der Auswahl ab' })),
      row(btn('Löschen', () => UI.meshop({ op: 'delete' }, 'Löschen'), { cls: 'sm', title: 'Entfernt alle Dreiecke, die einen gewählten Punkt berühren' }), btn('Abtrennen', () => UI.meshop({ op: 'separate' }, 'Abtrennen'), { cls: 'sm', title: 'Macht aus der Auswahl ein eigenes Objekt' }), btn('Kopieren', () => UI.meshop({ op: 'copy' }, 'Kopieren'), { cls: 'sm', title: 'Kopiert die Auswahl als neues Objekt' })),
      rng('Verschmelzen bis Abstand (m)', mgDist, 0.001, 0.5, 0.001, n => mgDist = n), row(btn('Zur Mitte', () => UI.meshop({ op: 'merge', mode: 'center' }, 'Verschmelzen'), { cls: 'sm' }), btn('Nach Abstand', () => UI.meshop({ op: 'merge', mode: 'distance', distance: mgDist }, 'Verschmelzen'), { cls: 'sm' }))),
    sec('Kantenschleife',
      hint('Schneidet das Netz an einer Ebene auf (Dreiecke werden geteilt). Danach lassen sich die neuen Punkte wählen und bewegen.'),
      row(selIn([['x', 'X'], ['y', 'Y'], ['z', 'Z']], lcAxis, v => lcAxis = v), h('span', { class: 'grow' }, numIn(lcN, { step: 1, min: 1, max: 32, int: true }, v => lcN = v)), btn('Einfügen', () => UI.meshop({ op: 'loopcut', axis: lcAxis, count: lcN }, 'Kantenschleife'), { cls: 'sm pri' }))),
    sec('Ganzes Objekt',
      row(btn('Unterteilen (Loop)', () => UI.subdivide('loop'), { cls: 'sm', title: 'Rundet ab, vervierfacht Dreiecke' }), btn('Unterteilen (flach)', () => UI.subdivide('flat'), { cls: 'sm', title: 'Behält die Form' })),
      rng('Laplace-Glättung', smoothLam, 0.1, 0.9, 0.05, n => smoothLam = n), row(btn('Objekt glätten', () => { const ob = E_.obj; if (!ob) return; const keep = ob; E_.leave(); geoOp('Glätten', x => F.geo.smooth(x.geometry, 2, smoothLam)); E_.enter(keep); }, { cls: 'sm' })),
      row(btn('UV erzeugen (Box)', () => PT_.ensureUV('box'), { cls: 'sm' }), btn('Kugel', () => PT_.ensureUV('sphere'), { cls: 'sm' }), btn('Zylinder', () => PT_.ensureUV('cylinder'), { cls: 'sm' }), btn('Planar', () => PT_.ensureUV('planar'), { cls: 'sm' }))));
  setTimeout(UI.refreshEdit, 0);
};
UI.meshop = function (c, label) {
  const ob = E_.obj; if (!ob) return; c = Object.assign({}, c);
  if (c.op !== 'loopcut') { if (!E_.sel.size) return F.say('Zuerst Punkte auswählen', 'err'); c.keys = E_.selKeys(); if (c.op === 'delete') c.any = true; }
  try { const r = F.meshEdit(ob, c); E_.leave(); E_.enter(ob); if (r.keys && r.keys.size) E_.selectKeys(r.keys); F.say(label + ': ' + r.info); }
  catch (e) { F.say(label + ' fehlgeschlagen: ' + e.message, 'err'); }
};
UI.subdivide = function (kind) {
  const ob = E_.obj; if (!ob) return; if (F.geo.stats(ob.geometry).tris * 4 > 400000) return F.say('Mesh ist bereits sehr fein', 'err');
  E_.leave(); geoOp(kind === 'loop' ? 'Unterteilen (Loop)' : 'Unterteilen (flach)', x => kind === 'loop' ? F.geo.subdivideLoop(x.geometry) : F.geo.subdivideFlat(x.geometry)); E_.enter(ob);
};

/* ----- Sculpt ----- */
UI.panels.sculpt = function (box) {
  const o = K_.obj, st = o ? F.geo.stats(o.geometry) : { tris: 0 };
  box.append(
    sec('Pinsel · ' + (o ? o.name : '—'), hint('Ziehen auf dem Modell formt. Alt oder rechte Maustaste dreht die Ansicht. Mit Strg+Z lässt sich jeder Strich zurücknehmen.'),
      h('div', { class: 'grid2' }, [['draw', 'Aufbauen'], ['inflate', 'Aufblasen'], ['smooth', 'Glätten'], ['pinch', 'Kneifen'], ['flatten', 'Planieren'], ['grab', 'Greifen']].map(([k, l]) => btn(l, () => { K_.brush = k; UI.drawPanel(true); }, { cls: 'sm', pressed: K_.brush === k }))),
      chk('Abtragen statt Aufbauen (invertiert)', K_.invert, v => K_.invert = v), chk('Symmetrie (X)', K_.sym, v => K_.sym = v)),
    sec('Einstellungen', rng('Radius (m)', K_.radius, 0.02, 2, 0.01, n => K_.radius = n), rng('Stärke', K_.strength, 0.05, 1, 0.01, n => K_.strength = n),
      fld('Abfall', selIn([['smooth', 'weich'], ['linear', 'linear'], ['sharp', 'spitz'], ['flat', 'flächig']], K_.falloff, v => K_.falloff = v))),
    sec('Auflösung', hint('<b>' + st.tris.toLocaleString('de-DE') + '</b> Dreiecke. Für feine Details unterteilen (vervierfacht die Zahl).'),
      row(btn('Unterteilen', () => { K_.subdivide(); UI.drawPanel(true); }, { cls: 'sm pri' })),
      hint('Beim Sculpten gehen UV-Koordinaten verloren. Für Texturen danach im Mesh-Modus „UV erzeugen“ wählen.')));
};

/* ----- Textur-Studio ----- */
const PAINT_TOOLS = [['brush', 'Pinsel'], ['eraser', 'Radierer'], ['fill', 'Füllen'], ['pick', 'Pipette'], ['line', 'Linie'], ['rect', 'Rechteck'], ['ellipse', 'Ellipse'], ['gradient', 'Verlauf'], ['hand', 'Hand']];
let fSel = 'blur', fA = null, fB = null, gSel = 'checker', gA = null;
UI.panels.paint = function (box) {
  const d = PT_.cur(), o = active();
  box.append(
    sec('Textur · Kanal', fld('Kanal', selIn(Object.keys(PT_.SLOTS).map(k => [k, PT_.SLOTS[k]]), PT_.slot, v => { PT_.slot = v; PT_.doc(); UI.drawPanel(true); P2.redraw(); })),
      row(btn('Dem Objekt zuweisen', () => PT_.assign(), { cls: 'sm pri', disabled: !o }), btn('Entfernen', () => PT_.unassign(), { cls: 'sm', disabled: !o })),
      chk('Direkt auf dem 3D-Modell malen', PT_.paint3d, v => { PT_.paint3d = v; V.setTool(v ? 'paint3d' : 'select'); if (v && o) PT_.assign(PT_.slot, true); }),
      row(btn('UV erzeugen', () => PT_.ensureUV('box'), { cls: 'sm', disabled: !o, title: 'Box-Projektion (Ersatz für fehlende UVs)' }), chk('UV-Netz zeigen', PT_.showUV, v => { PT_.showUV = v; P2.redraw(); })),
      hint('Das Bild links ist die Textur. Mit dem Pinsel dort oder direkt am Modell malen.')),
    sec('Werkzeug', h('div', { class: 'grid3' }, PAINT_TOOLS.map(([k, l]) => btn(l, () => { PT_.tool = k; UI.drawPanel(true); }, { cls: 'sm', pressed: PT_.tool === k }))),
      row(fld('Farbe 1', h('input', { type: 'color', value: PT_.color, oninput: e => { PT_.color = e.target.value; } })), fld('Farbe 2', h('input', { type: 'color', value: PT_.color2, oninput: e => { PT_.color2 = e.target.value; } }))),
      rng('Größe (px)', PT_.brush.size, 1, 300, 1, n => PT_.brush.size = n, x => String(x)), rng('Härte', PT_.brush.hardness, 0, 1, 0.01, n => PT_.brush.hardness = n), rng('Deckkraft', PT_.brush.opacity, 0.05, 1, 0.01, n => PT_.brush.opacity = n),
      chk('Formen gefüllt', PT_.fillShape, v => PT_.fillShape = v)),
    sec('Ebenen', ...d.layers.map((l, i) => i).reverse().map(i => {
      const l = d.layers[i]; return h('div', { class: 'layer' + (i === d.active ? ' sel' : ''), onclick: () => { d.active = i; UI.drawPanel(true); } },
        h('button', { class: 'eye', type: 'button', 'aria-pressed': String(l.visible), onclick: e => { e.stopPropagation(); l.visible = !l.visible; PT_.compose(d); UI.drawPanel(true); } }, l.visible ? '●' : '○'), h('span', { text: l.name }));
    }),
      (() => { const l = PT_.layer(); return h('div', { class: 'fld col' }, selIn(PT_.BLEND, l.blend, v => { l.blend = v; PT_.compose(); }), rng('Ebenen-Deckkraft', l.opacity, 0, 1, 0.01, n => { l.opacity = n; PT_.compose(); })); })(),
      row(btn('Neu', () => PT_.layerOp('add'), { cls: 'sm' }), btn('Kopie', () => PT_.layerOp('dup'), { cls: 'sm' }), btn('↑', () => PT_.layerOp('up'), { cls: 'sm' }), btn('↓', () => PT_.layerOp('down'), { cls: 'sm' }), btn('Nach unten', () => PT_.layerOp('merge'), { cls: 'sm' }), btn('Alle', () => PT_.layerOp('flatten'), { cls: 'sm', title: 'Auf eine Ebene reduzieren' }), btn('Löschen', () => PT_.layerOp('del'), { cls: 'sm dng' }))),
    sec('Filter', (() => {
      const f = PT_.FILTERS[fSel]; if (fA === null || fSel !== UI._fs) { fA = f.a ? f.a[3] : 0; fB = f.b ? f.b[3] : 0; UI._fs = fSel; }
      return h('div', { class: 'fld col' }, selIn(Object.keys(PT_.FILTERS).map(k => [k, PT_.FILTERS[k].label]), fSel, v => { fSel = v; UI.drawPanel(true); }),
        f.a ? rng(f.a[0], fA, f.a[1], f.a[2], 1, n => fA = n, x => String(x)) : null, f.b ? rng(f.b[0], fB, f.b[1], f.b[2], 1, n => fB = n, x => String(x)) : null,
        row(btn('Anwenden', safe(() => PT_.applyFilter(fSel, fA, fB)), { cls: 'sm pri' }), btn('Spiegeln ↔', () => PT_.flip('h'), { cls: 'sm' }), btn('Spiegeln ↕', () => PT_.flip('v'), { cls: 'sm' })));
    })()),
    sec('Muster erzeugen (auf aktive Ebene)', (() => {
      const g = PT_.GENS[gSel]; if (gA === null || gSel !== UI._gs) { gA = g.a ? g.a[3] : 0; UI._gs = gSel; }
      return h('div', { class: 'fld col' }, selIn(Object.keys(PT_.GENS).map(k => [k, PT_.GENS[k].label]), gSel, v => { gSel = v; UI.drawPanel(true); }), g.a && g.a[2] ? rng(g.a[0], gA, g.a[1], g.a[2], 1, n => gA = n, x => String(x)) : null,
        row(btn('Erzeugen (Farbe 1 / 2)', safe(() => PT_.generate(gSel, gA)), { cls: 'sm pri' })));
    })()),
    sec('Datei',
      row(fileBtn('Bild als Ebene …', 'image/*', f => PT_.importImage(f), { cls: 'sm' }), btn('Rückgängig', () => PT_.undo(), { cls: 'sm' })),
      fld('Größe', selIn([[256, '256 px'], [512, '512 px'], [1024, '1024 px'], [2048, '2048 px']], PT_.size, v => { PT_.resetDoc(parseInt(v)); })),
      hint('Größe ändern setzt die Textur dieses Kanals zurück.')));
};

/* ----- Rig ----- */
let rigSharp = 3, rigBoneSize = 1;
UI.refreshBoneFields = function () { const b = RG_.sel; if (!b || !UI.bf) return; UI.bf.forEach((i, n) => { if (document.activeElement !== i) i.value = fix(b.position.toArray()[n], 4); }); };
/* ----- Foto ----- */
UI.panels.photo = function (box) {
  const PH = F.photo, C = PH.cfg, n = PH.views.length, inc = PH.included().length, v = PH.views[PH.sel], busy = PH.busy;
  const photoBtn = (label, o) => { const inp = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true, onchange: e => { const fs = e.target.files; if (fs && fs.length) PH.addFiles(fs); e.target.value = ''; } }); return h('span', null, inp, btn(label, () => inp.click(), o)); };
  const sim = safe(() => { if (!V.objects().length) return F.say('Zuerst ein Modell in die Szene laden (z. B. „Szene … → Rettungswagen“)', 'err'); F.say('Testaufnahmen werden gerendert …', '', true); setTimeout(() => PH.addSimulated({ n: 24, elev: 22, f35: 30 }).catch(e => F.say(e.message, 'err')), 30); });
  box.append(
    sec('Aufnahmen', hint('Ein Objekt auf <b>einfarbigem Untergrund</b> rundherum fotografieren (16 bis 40 Fotos, leicht von oben, immer ganz im Bild) oder auf einem Drehteller drehen. Auch ein Video geht. Alles bleibt lokal im Browser.'),
      row(photoBtn('Fotos oder Video wählen …', { cls: 'sm pri' }), btn('Alle entfernen', () => PH.clear(), { cls: 'sm', disabled: !n })),
      row(btn('Testaufnahmen aus der Szene', sim, { cls: 'sm', title: 'Rendert die Objekte der Szene von rundherum, damit du den Ablauf ohne eigene Fotos ausprobieren kannst' })),
      n ? h('p', { class: 'hint', text: inc + ' von ' + n + ' Fotos aktiv' + (v && v.warn ? ' · Foto ' + (PH.sel + 1) + ': ' + v.warn : '') }) : null,
      n && v ? row(btn(v.skip ? 'Dieses Foto einbeziehen' : 'Dieses Foto ausschließen', () => { v.skip = !v.skip; UI.drawPanel(true); P2.redraw(); }, { cls: 'sm' }), btn('Foto entfernen', () => { PH.views.splice(PH.sel, 1); PH.sel = Math.max(0, Math.min(PH.sel, PH.views.length - 1)); F.photoEditor.fit(); UI.drawPanel(true); P2.redraw(); }, { cls: 'sm' })) : null),
    sec('Maske (Objekt vom Hintergrund trennen)',
      rng('Empfindlichkeit', C.k, 0.4, 2.5, 0.05, x => { C.k = x; }, x => fix(x, 2) + '×'), hint('Kleiner = mehr Objekt, größer = mehr Hintergrund.'),
      row(btn('Masken neu berechnen', () => { PH.views.forEach(u => { u.manual = false; }); PH.segmentAll(); UI.drawPanel(true); }, { cls: 'sm', disabled: !n || busy })),
      h('div', { class: 'seg' }, [['view', 'Ansicht'], ['add', 'Maske +'], ['sub', 'Maske −']].map(([k, l]) => btn(l, () => { PH.tool = k; UI.drawPanel(true); P2.redraw(); }, { cls: 'sm', pressed: PH.tool === k }))),
      rng('Pinselgröße', PH.brush, 4, 80, 1, x => { PH.brush = x; }, x => Math.round(x) + ' px')),
    sec('Kamera',
      hint('Die Fotos müssen der Reihe nach rund um das Objekt aufgenommen sein (Dateinamen sortiert).'),
      chk('Elevation und Brennweite automatisch suchen', C.autoCal, x => { C.autoCal = x; UI.drawPanel(true); }),
      C.autoCal ? null : row(fld('Elevation (°)', numIn(C.elev, { step: 1, min: -60, max: 85 }, x => C.elev = x)), fld('Brennweite (mm)', numIn(C.f35, { step: 1, min: 12, max: 135 }, x => C.f35 = x))),
      row(fld('Winkelbereich (°)', numIn(C.range, { step: 10, min: 30, max: 360 }, x => C.range = x)), fld('Richtung', selIn([[0, 'automatisch'], [1, 'links herum'], [-1, 'rechts herum']], C.dir, x => C.dir = parseInt(x, 10)))),
      chk('Winkel je Foto nachziehen', C.refine, x => C.refine = x), chk('Belichtung nach dem Hintergrund angleichen', C.gain, x => C.gain = x)),
    sec('Modell',
      row(fld('Auflösung', selIn([[80, 'Schnell (80)'], [128, 'Normal (128)'], [176, 'Fein (176)'], [200, 'Sehr fein (200)']], C.res, x => C.res = parseInt(x, 10))), fld('Größe (m)', numIn(C.size, { step: 0.1, min: 0.01 }, x => C.size = x))),
      rng('Glätten', C.smooth, 0, 10, 1, x => C.smooth = Math.round(x), x => String(Math.round(x))),
      row(fld('Fehlertoleranz', selIn([[0, 'streng'], [1, 'ein Foto darf irren'], [2, 'zwei Fotos']], C.tol, x => C.tol = parseInt(x, 10))), fld('Textur', selIn([[0, 'keine'], [2048, '2048'], [4096, '4096']], C.tex ? C.texSize : 0, x => { x = parseInt(x, 10); C.tex = x > 0; if (x) C.texSize = x; }))),
      row(btn(busy ? 'Rechnet …' : 'Modell berechnen', () => PH.build(), { cls: 'pri', disabled: busy || inc < 3 })),
      PH.last ? h('p', { class: 'hint', html: '<b>Letztes Ergebnis:</b> ' + PH.last.tris.toLocaleString('de-DE') + ' Dreiecke · Elevation ' + fix(PH.last.elev, 0) + '° · Brennweite ' + fix(PH.last.f35, 0) + ' mm · ' + fix(PH.last.ms / 1000, 1) + ' s' }) : null),
    sec('Ehrlich gesagt', hint('Das Verfahren bildet die <b>äußere Hülle</b> aus den Silhouetten und legt die Fotos als Textur darüber. Tiefe Mulden, Hohlräume, Glas und Spiegelungen erfasst es nicht, ganze Räume auch nicht. Für Scans mit Tiefeninformation (LiDAR, COLMAP, Polycam, Scaniverse) lieber das Ergebnis über „Importieren“ laden: GLB, OBJ, PLY und Splats gehen.')));
};

UI.panels.rig = function (box) {
  const sel = RG_.sel, o = active(), edit = RG_.mode === 'edit', bound = !!RG_.skeleton;
  const tree = h('div', { class: 'tree' }); const walk = (b, d) => { tree.append(h('div', { class: 'tr' + (b === sel ? ' sel' : ''), style: { paddingLeft: (6 + d * 12) + 'px' }, onclick: () => RG_.select(b), text: b.name })); RG_.children(b).forEach(c => walk(c, d + 1)); };
  RG_.root.children.filter(c => c.isBone).forEach(b => walk(b, 0)); if (!RG_.bones.length) tree.append(h('div', { class: 'empty', text: 'Noch keine Knochen' }));
  UI.bf = [];
  box.append(
    sec('Modus', h('div', { class: 'seg' }, btn('Knochen bauen', () => { RG_.setMode('edit'); UI.drawPanel(true); }, { cls: 'sm', pressed: edit }), btn('Pose / Animation', () => { RG_.setMode('pose'); UI.drawPanel(true); }, { cls: 'sm', pressed: !edit })),
      hint(bound ? 'Das Mesh <b>' + RG_.mesh.name + '</b> ist gebunden. Knochen drehen verformt es.' : edit ? 'Knochen setzen: „Platzieren“ einschalten, dann ins Fenster klicken. Der gewählte Knochen wird zum Elternteil des nächsten.' : 'Knochen wählen (Kugel anklicken oder in der Liste), dann drehen. Bei IK das rote Ziel ziehen.')),
    sec('Skelett', row(selIn([['', 'Vorlage …'], ['humanoid', 'Mensch'], ['arm', 'Arm'], ['chain', 'Kette (Schlange, Schwanz)']], '', v => { if (v) { if (bound) return F.say('Zuerst Mesh lösen', 'err'); RG_.preset(v); } })),
      edit ? row(chk('Platzieren', RG_.place, v => { RG_.place = v; if (v) F.say('Ins Fenster klicken, um Knochen zu setzen'); }), btn('Neue Wurzel', () => { RG_.select(null); }, { cls: 'sm' })) : null,
      tree, rng('Knochen-Größe', RG_.size, 0.2, 4, 0.1, n => { RG_.setSize(n); }, x => '×' + fix(x, 1)),
      row(btn('Löschen', () => { if (RG_.sel) RG_.remove(RG_.sel); }, { cls: 'sm dng', disabled: !sel || bound }), btn('Alle löschen', () => RG_.clearAll(), { cls: 'sm dng' }))),
    sel ? sec('Knochen · ' + sel.name,
      fld('Name', h('input', { type: 'text', value: sel.name, onchange: e => { const n = e.target.value.trim(); if (n) { sel.name = RG_.bones.some(b => b !== sel && b.name === n) ? RG_.unique(n) : n; UI.drawPanel(true); } } })),
      h('div', { class: 'fld col' }, h('span', { class: 'hint', text: 'Lokale Position (m)' }), h('div', { class: 'xyz' }, [0, 1, 2].map(i => { const inp = numIn(sel.position.toArray()[i], { step: 0.05 }, n => { if (!edit) return F.say('Positionen nur im Bau-Modus ändern', 'err'); const a = sel.position.toArray(); a[i] = n; sel.position.fromArray(a); RG_.root.updateMatrixWorld(true); RG_.refreshViz(); }); UI.bf.push(inp); return inp; })))) : null,
    sec('Mesh binden', hint(o && !o.isSkinnedMesh ? 'Gewähltes Objekt: <b>' + o.name + '</b>' : bound ? 'Gebunden an <b>' + RG_.mesh.name + '</b>' : 'Ein Mesh auswählen (Objekt-Liste).'),
      rng('Schärfe der Gewichte', rigSharp, 1, 8, 0.5, n => rigSharp = n, x => String(x)),
      row(btn('Binden (Auto-Gewichte)', safe(() => { RG_.bind(o, rigSharp); }), { cls: 'sm pri', disabled: bound || !o || !RG_.bones.length }), btn('Lösen', () => RG_.unbind(), { cls: 'sm', disabled: !bound })),
      hint('Jeder Punkt folgt den nächsten Knochen. Das Mesh sollte in der Ruhepose (T-Pose) liegen.')),
    !edit ? sec('Pose & IK', row(selIn([['rotate', 'Drehen'], ['translate', 'Verschieben']], RG_.gizmo, v => { RG_.gizmo = v; RG_.attachGizmo(); })), row(btn('Pose zurücksetzen', () => RG_.resetPose(), { cls: 'sm' })),
      row(btn(RG_.ik.on ? 'IK stoppen' : 'IK starten', () => { RG_.ik.on ? RG_.stopIK() : RG_.startIK(); }, { cls: 'sm', pressed: RG_.ik.on }), h('span', { class: 'grow' }, numIn(RG_.ik.len, { step: 1, min: 1, max: 12, int: true }, v => RG_.ik.len = v)), h('span', { class: 'hint', text: 'Kettenglieder' })),
      hint('IK: Endknochen (z. B. Hand) wählen, „IK starten“, rotes Ziel ziehen.')) : null,
    !edit ? sec('Animation',
      h('div', { class: 'fld col' }, h('span', { class: 'row' }, h('span', { class: 'grow hint', text: 'Zeit' }), h('span', { class: 'mono', id: 'tl-label', text: fix(RG_.time, 2) + ' s' })), h('input', { type: 'range', id: 'tl-time', min: 0, max: RG_.duration, step: 0.01, value: RG_.time, oninput: e => { RG_.playing = false; RG_.seek(parseFloat(e.target.value)); $('#tl-label').textContent = fix(RG_.time, 2) + ' s'; } })),
      row(btn(RG_.playing ? '❚❚ Pause' : '▶ Abspielen', () => { RG_.play(); }, { cls: 'sm pri' }), btn('Key setzen (K)', () => RG_.setKey(RG_.time), { cls: 'sm' }), btn('Key löschen', () => RG_.delKey(RG_.time), { cls: 'sm dng' })),
      row(fld('Dauer (s)', numIn(RG_.duration, { step: 0.5, min: 0.2, max: 60 }, v => { RG_.duration = v; UI.drawPanel(true); })), chk('Schleife', RG_.loop, v => RG_.loop = v)),
      h('div', { class: 'keys' }, RG_.keys.length ? RG_.keys.map(k => h('span', { class: 'key' + (Math.abs(k.t - RG_.time) < 0.02 ? ' on' : ''), onclick: () => { RG_.playing = false; RG_.seek(k.t); UI.drawPanel(true); }, text: fix(k.t, 2) + ' s' })) : h('span', { class: 'hint', text: 'Keine Keys. Pose einstellen, Zeit wählen, „Key setzen“.' })),
      hint('Animation und Skelett gehen als glTF/GLB und (Skelett) in den Unity- und Blender-Export.')) : null);
};

/* ----- Karte ----- */
let mapText = '', mapOpt = { buildings: true, roads: true, water: true, green: true, ground: true, heightScale: 1, roadScale: 1, drape: true }, mapPlanar = false, bb = { s: 51.5075, w: 7.4575, n: 51.519, e: 7.4735 }, hmMode = 'gray', hmH = 40, hmRes = 128, mapInfo = '';
UI.panels.map = function (box) {
  const ta = h('textarea', { rows: 6, placeholder: 'GeoJSON oder Overpass-JSON einfügen …', oninput: e => mapText = e.target.value }); ta.value = mapText;
  const info = h('p', { class: 'hint', text: mapInfo || (MP_.data ? MP_.summary() : 'Noch keine Kartendaten geladen.') });
  const load = safe(() => { mapInfo = ''; MP_.parse(mapText, { planar: mapPlanar ? true : undefined }); mapInfo = MP_.summary(); info.textContent = mapInfo; F.say(mapInfo); });
  box.append(
    sec('Kartendaten', hint('Einfügen: <b>GeoJSON</b> (z. B. von geojson.io), <b>Overpass-JSON</b> (OpenStreetMap) oder eine einfache Liste aus [x, y]-Punkten in Metern. Ein Sprachmodell kann solche Daten für einen Ort ebenfalls aufschreiben.'), ta,
      row(btn('Laden', load, { cls: 'sm pri' }), fileBtn('Datei …', '.json,.geojson,.txt', f => { const fr = new FileReader(); fr.onload = () => { mapText = String(fr.result); ta.value = mapText.length > 60000 ? mapText.slice(0, 60000) + ' …' : mapText; load(); }; fr.readAsText(f); }, { cls: 'sm' }), btn('Beispielstadt', safe(() => { MP_.parse(JSON.stringify(MP_.sampleGeoJSON())); mapInfo = MP_.summary(); UI.drawPanel(true); }), { cls: 'sm' })),
      chk('Koordinaten sind Meter (nicht Grad)', mapPlanar, v => mapPlanar = v), info),
    sec('Erzeugen', ...[['buildings', 'Gebäude'], ['roads', 'Straßen & Gleise'], ['water', 'Wasser'], ['green', 'Grünflächen'], ['ground', 'Bodenplatte']].map(([k, l]) => chk(l, mapOpt[k], v => mapOpt[k] = v)),
      rng('Gebäudehöhe', mapOpt.heightScale, 0.3, 3, 0.1, n => mapOpt.heightScale = n, x => '×' + fix(x, 1)), rng('Straßenbreite', mapOpt.roadScale, 0.5, 3, 0.1, n => mapOpt.roadScale = n, x => '×' + fix(x, 1)),
      chk('Auf Gelände setzen (falls geladen)', mapOpt.drape, v => mapOpt.drape = v),
      row(btn('Karte → 3D', safe(() => { if (!MP_.data) load(); if (MP_.data) MP_.build(mapOpt); }), { cls: 'sm pri' }), btn('Stadt-Beispiel direkt', safe(() => MP_.sample()), { cls: 'sm' })),
      hint('Ohne Höhenangabe schätzt das Programm Gebäudehöhen (Stockwerke × 3,2 m oder 6–15 m).')),
    sec('Gelände',
      hint('Höhenkarte aus einem Graustufenbild (hell = hoch) oder einer „Terrarium“-Höhenkachel (RGB-kodiert, Meter). Kartenkacheln lassen sich in diesem Fenster nicht aus dem Netz laden.'),
      fld('Bildart', selIn([['gray', 'Graustufen'], ['terrarium', 'Terrarium (RGB)']], hmMode, v => hmMode = v)), fld('Höhe (m)', numIn(hmH, { step: 5, min: 1 }, v => hmH = v)), fld('Auflösung', selIn([[64, '64 × 64'], [128, '128'], [192, '192'], [256, '256']], hmRes, v => hmRes = parseInt(v))),
      row(fileBtn('Höhenkarte laden …', 'image/*', f => { MP_.terrainFromFile(f, { mode: hmMode, height: hmH, maxRes: hmRes, exag: 1 }).catch(e => F.say(e.message, 'err')); }, { cls: 'sm pri' }), btn('Hügel erzeugen', safe(() => MP_.noiseTerrain({ height: hmH, res: Math.min(hmRes, 160) })), { cls: 'sm' }), btn('Gelände vergessen', () => { MP_.clearTerrain(); F.say('Gelände wird beim nächsten Erzeugen nicht mehr verwendet'); }, { cls: 'sm' }))),
    sec('Overpass-Abfrage (OpenStreetMap)',
      hint('Rahmen in Grad eintragen (Süd, West, Nord, Ost). Abfrage kopieren, bei overpass-turbo.eu ausführen, Ergebnis als JSON kopieren und oben einfügen.'),
      h('div', { class: 'grid2' }, [['s', 'Süd'], ['w', 'West'], ['n', 'Nord'], ['e', 'Ost']].map(([k, l]) => fld(l, numIn(bb[k], { step: 0.001 }, v => bb[k] = v)))),
      row(btn('Abfrage kopieren', () => F.copyText(MP_.query(bb.s, bb.w, bb.n, bb.e), 'Overpass-Abfrage kopiert'), { cls: 'sm pri' }), h('a', { href: 'https://overpass-turbo.eu/', target: '_blank', rel: 'noopener noreferrer', class: 'btn sm', text: 'overpass-turbo.eu öffnen' }))));
};


/* ----- Punktwolken und Splats: Ebenen-Liste ----- */
let cloudOpt = { res: 140, thr: 0.7, smooth: 6 };
function cloudSection() {
  const P = F.pc, L = P.layers; if (!L.length) return null;
  return h('div', { class: 'fld col' }, h('span', { class: 'hint', text: 'Punktwolken und Splats (nur Ansicht, bis sie in ein Netz gewandelt werden)' }),
    ...L.map(l => h('div', { class: 'layer' },
      h('div', { class: 'row' }, h('button', { class: 'eye', type: 'button', 'aria-pressed': String(l.obj.visible), title: 'Sichtbar / unsichtbar', onclick: () => { l.obj.visible = !l.obj.visible; V.requestRender(); UI.drawPanel(true); } }, l.obj.visible ? '●' : '○'), h('span', { class: 'grow', text: l.name + ' · ' + l.n.toLocaleString('de-DE') + (l.kind === 'splat' ? ' Splats' : ' Punkte') })),
      h('div', { class: 'row' }, btn('In Netz wandeln', safe(() => { F.say('Netz wird berechnet …', '', false); const ref = l; setTimeout(() => P.toMesh(ref, cloudOpt).then(geo => { const o = F.exp.addCloudMesh(geo, ref.name + ' Netz'); F.say('Netz „' + o.name + '“: ' + F.geo.stats(o.geometry).tris.toLocaleString('de-DE') + ' Dreiecke'); UI.drawPanel(true); }, e => F.say(e.message, 'err')), 30); }), { cls: 'sm pri' }),
        btn('Kippen 180°', () => { l.obj.rotation.x += Math.PI; V.requestRender(); }, { cls: 'sm', title: 'Oben und unten tauschen (Splats aus COLMAP stehen oft auf dem Kopf)' }), btn('Löschen', () => { const o = l.obj, i = P.layers.indexOf(l); P.remove(l); H.push('Löschen: ' + l.name, () => { P.layers.splice(i, 0, l); V.world.add(o); UI.drawPanel(true); V.requestRender(); }, () => { P.remove(l); }); }, { cls: 'sm' })),
      l.obj.material.isPointsMaterial ? rng('Punktgröße', l.obj.material.size, 1, 8, 0.5, n => P.setPointSize(l, n), x => x + ' px') : null)),
    rng('Auflösung (Zellen)', cloudOpt.res, 60, 260, 10, n => cloudOpt.res = n, x => String(x)), rng('Schwelle (höher = schlanker)', cloudOpt.thr, 0.2, 2, 0.05, n => cloudOpt.thr = n, x => x.toFixed(2)), rng('Glätten', cloudOpt.smooth, 0, 20, 1, n => cloudOpt.smooth = n, x => String(x)));
}
/* ----- Export ----- */
let exp = { fmt: 'unity', scope: 'sel', skin: true, anim: true, zup: true, text: '', res: null, busy: false }, impText = '', scriptText = '', texSave = false, outInfo = '';
UI.panels.code = function (box) {
  const groups = {}; F.exp.formats.forEach(f => (groups[f.group] = groups[f.group] || []).push(f));
  const fm = F.exp.formats.find(f => f.id === exp.fmt);
  const sel = h('select', { onchange: e => { exp.fmt = e.target.value; exp.res = null; UI.genExport(); UI.drawPanel(true); } }, Object.keys(groups).map(g => h('optgroup', { label: g }, groups[g].map(f => h('option', { value: f.id, selected: f.id === exp.fmt ? true : undefined }, f.label)))));
  const out = h('textarea', { id: 'out', rows: 12, class: 'code', readonly: true, spellcheck: false, wrap: 'off' }); out.value = exp.text;
  const info = h('p', { class: 'hint', id: 'out-info', text: outInfo });
  const imp = h('textarea', { rows: 5, placeholder: 'OBJ, STL (Text), glTF-JSON, Formwerk-Szene, GeoJSON, Overpass-JSON oder Befehle …', oninput: e => impText = e.target.value }); imp.value = impText;
  const scr = h('textarea', { rows: 7, placeholder: 'JavaScript, z. B.\nbox({w:2,h:1,d:1,color:"#c47d6d"})\nsubtract(box({w:2,h:1,d:1}), cylinder({rt:.3,rb:.3,h:2,pos:[0,.5,0],rot:[90,0,0]}))\n\noder JSON-Befehle, z. B.\n[{"add":"sphere","r":0.6,"pos":[0,1,0],"color":"#7fb59a"}]', oninput: e => scriptText = e.target.value, spellcheck: false }); scr.value = scriptText;
  box.append(
    sec('Code & Dateien erzeugen', fld('Format', sel), hint(fm ? fm.hint : ''),
      fld('Umfang', selIn([['sel', 'Auswahl (sonst alles)'], ['all', 'Alle sichtbaren Objekte']], exp.scope, v => { exp.scope = v; UI.genExport(); })),
      (fm && fm.prep && fm.prep.skin && RG_.skeleton) ? chk('Skelett und Gewichte einbeziehen', exp.skin, v => { exp.skin = v; UI.genExport(); }) : null,
      (fm && fm.async) ? chk('Animation einschließen', exp.anim, v => { exp.anim = v; UI.genExport(); }) : null,
      (fm && fm.id === 'stl') ? chk('Z oben (3D-Druck / CAD)', exp.zup, v => { exp.zup = v; UI.genExport(); }) : null,
      row(btn('Erzeugen', () => UI.genExport(), { cls: 'sm pri' }), btn('Kopieren', () => { if (exp.text) F.copyText(exp.text, 'Kopiert: ' + exp.text.length.toLocaleString('de-DE') + ' Zeichen'); else F.say('Erst erzeugen', 'err'); }, { cls: 'sm' }), btn('Als Datei', () => { if (exp.res) F.saveBlob(exp.res.blob, exp.res.name); else F.say('Erst erzeugen', 'err'); }, { cls: 'sm' })),
      out, info),
    sec('Importieren', row(importBtn('Dateien öffnen …', { cls: 'sm pri' })),
      fld('Einheit der Datei', selIn([['auto', 'Automatisch (FBX: Zentimeter erkennen)'], ['1', 'Meter'], ['0.01', 'Zentimeter'], ['0.001', 'Millimeter'], ['0.0254', 'Zoll']], S.importUnit || 'auto', v => { S.importUnit = v; })),
      chk('STL: Z zeigt nach oben', S.stlZup !== false, v => { S.stlZup = v; }), chk('PLY: Z zeigt nach oben', S.plyZup === true, v => { S.plyZup = v; }),
      hint('Unterstützt: GLB, glTF, VRM, FBX, OBJ, DAE, STL, PLY, 3DS, 3MF, ZIP (mit Texturen), Punktwolken (XYZ, PTS, PCD, LAS, PLY) und Gaussian Splats (.splat, 3DGS-PLY). Mehrere Dateien auf einmal oder ins Fenster ziehen; mehrere Fotos öffnen den Fotomodus. Skelette, Animationen und Mimik werden nicht übernommen.'),
      cloudSection(),
      imp, row(btn('Text laden', safe(() => { F.exp.importText(impText, 'Einfügen').then(k => { F.say('Geladen (' + k + ')'); UI.drawPanel(true); }, e => F.say(e.message, 'err')); }), { cls: 'sm pri' }), h('span', { class: 'hint', text: 'Ein Sprachmodell kann außerdem OBJ-Text oder JSON-Befehle für dieses Fenster schreiben.' }))),
    sec('Szene speichern', chk('Texturen einbetten (größer)', texSave, v => texSave = v),
      row(btn('Szene als JSON', safe(() => { const j = JSON.stringify(F.exp.serialize({ tex: texSave })); exp.text = j; exp.res = { blob: new Blob([j], { type: 'application/json' }), name: 'formwerk-szene.json' }; outInfo = 'Formwerk-Szene · ' + (j.length / 1024).toFixed(1) + ' KB – kopieren und später unter „Importieren“ einfügen'; UI.drawPanel(true); }), { cls: 'sm' }))),
    sec('Skript & Befehle', scr,
      row(btn('Ausführen', () => F.run(scriptText), { cls: 'sm pri' }), btn('Befehle für Sprachmodell kopieren', () => F.copyText(F.llmPrompt(), 'Anleitung für das Sprachmodell kopiert'), { cls: 'sm', title: 'Fügt die Syntax ein, damit ein Sprachmodell passende JSON-Befehle schreibt' })),
      hint('Skript-Funktionen: <span class="mono">box sphere cylinder cone torus plane capsule gear … union subtract intersect move rotate scale color remove clear</span>. Schlägt Skript-Ausführung im Chat-Fenster fehl, nimm JSON-Befehle.')));
  if (!exp.text && F.exp) setTimeout(() => UI.genExport(true), 0);
};
UI.genExport = function (quiet) {
  if (S.mode !== 'code' && !quiet) { }
  if (exp.busy) return; exp.busy = true;
  F.exp.generate(exp.fmt, { scope: exp.scope, skin: exp.skin, anim: exp.anim, zup: exp.zup }).then(r => {
    exp.busy = false; exp.res = r; exp.text = r.text; const kb = (r.text.length / 1024);
    outInfo = r.name + ' · ' + (kb > 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(1) + ' KB') + (r.tris ? ' · ' + r.tris.toLocaleString('de-DE') + ' Dreiecke' : '') + (r.note ? ' · ' + r.note : '') + (kb > 1500 ? ' · sehr groß: Kopieren kann in Chat-Fenstern scheitern, Mesh vorher vereinfachen' : '');
    const o = $('#out'); if (o) o.value = exp.text; const i = $('#out-info'); if (i) i.textContent = outInfo;
  }, e => { exp.busy = false; exp.text = ''; outInfo = ''; const i = $('#out-info'); if (i) i.textContent = ''; F.say(e.message || String(e), 'err'); });
};

/* ---------- Szenen-Aktionen, Thema, Autosave ---------- */
UI.sceneAction = function (v) {
  if (v === 'new') { UI.clearScene(); F.say('Leere Szene'); }
  else if (v === 'demo') F.demo();
  else if (v === 'city') { UI.clearScene(); MP_.sample(); UI.setMode('map'); }
  else if (v === 'rig') F.demoRig();
  else if (v === 'rtw') { F.say('Rettungswagen wird berechnet …', '', false); setTimeout(() => { try { F.demoAmbulance(); } catch (e) { F.say('Rettungswagen: ' + e.message, 'err'); console.error(e); } }, 30); }
  else if (v === 'scan') { F.say('Scanner-Demo läuft …', '', false); setTimeout(() => F.demoScan().catch(e => { F.say('Scanner-Demo: ' + e.message, 'err'); console.error(e); }), 30); }
  else if (v === 'restore') UI.restore();
};
UI.clearScene = function () { if (S.mode !== 'object') UI.setMode('object'); F.measure.clear(); F.pc.clear(); V.objects().forEach(o => V._detach(o)); RG_.clearAll(); F.history.clear(); MP_.hm = null; MP_.last = null; V.select(null); V.refreshAll(); };
let svT = 0;
UI.autosave = function () {
  clearTimeout(svT); svT = setTimeout(() => { try { if (!V.objects().length) return; const j = JSON.stringify(F.exp.serialize({ tex: false })); if (j.length < 3500000) localStorage.setItem('formwerk3d-autosave', j); } catch (e) { /* Speicher nicht verfügbar */ } }, 2500);
};
UI.restore = function () { try { const j = localStorage.getItem('formwerk3d-autosave'); if (!j) return F.say('Keine gespeicherte Sitzung gefunden', 'err'); UI.setMode('object'); F.exp.deserialize(JSON.parse(j)); } catch (e) { F.say('Sitzung nicht ladbar: ' + e.message, 'err'); } };
UI.themeChanged = function () { try { V.applyTheme(); RG_.m = null; RG_.refreshViz(); if (E_.obj) E_.colorPts(); P2.redraw(); V.objects().forEach(o => V.rebuildWire(o)); V.requestRender(); } catch (e) { console.warn(e); } };
UI.cycleTheme = function () {
  const r = document.documentElement, cur = r.getAttribute('data-theme'), next = cur === 'light' ? 'dark' : cur === 'dark' ? null : 'light';
  if (next) r.setAttribute('data-theme', next); else r.removeAttribute('data-theme'); F.say('Darstellung: ' + (next === 'light' ? 'hell' : next === 'dark' ? 'dunkel' : 'wie System'));
};
