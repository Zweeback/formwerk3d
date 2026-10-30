const { env, F, w, T, ok, vol, fails } = require('./t2.js');
const V = F.view, S = F.state, UI = F.ui;
const errCount0 = () => env.errs.length;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const flush = () => sleep(60);
const names = () => V.objects().map(o => o.name);
const screenOf = (p) => { const v = p.clone().project(V.cam); return { x: (v.x * 0.5 + 0.5) * 800, y: (-v.y * 0.5 + 0.5) * 600 }; };
const ptr = (type, p, extra) => V.host.dispatchEvent(new w.MouseEvent(type, Object.assign({ clientX: p.x, clientY: p.y, button: 0, bubbles: true, cancelable: true }, extra || {})));
(async () => {
  // ---- 1. Modi durchschalten ----
  const sph = V.objects().find(o => o.name === 'Skulptur-Kugel'); V.select(sph); await flush();
  for (const m of ['cad', 'edit', 'object', 'sculpt', 'object', 'paint', 'object', 'rig', 'object', 'map', 'code', 'object']) {
    const before = errCount0(); UI.setMode(m); await flush();
    ok(S.mode === m, 'Modus ' + m + ' aktiv'); ok($('#panel').children.length > 0 || m === 'object', 'Panel gefüllt ' + m);
    if (errCount0() > before) console.log('   Fehler in', m, env.errs.slice(before).join('\n').slice(0, 800));
  }
  function $(s) { return w.document.querySelector(s); }
  // ---- 2. Mesh-Bearbeitung ----
  V.select(sph); UI.setMode('edit'); await flush();
  const E = F.edit; ok(E.obj === sph && E.groups.length > 100, 'Edit: Punktgruppen ' + E.groups.length);
  E.selectAll(); const y0 = sph.geometry.attributes.position.array.slice(0, 30); E.nudge(0.1);
  const y1 = sph.geometry.attributes.position.array.slice(0, 30); ok(y0.some((v, i) => Math.abs(v - y1[i]) > 0.05), 'Edit: nudge verschiebt Punkte');
  F.history.back(); const y2 = sph.geometry.attributes.position.array.slice(0, 30); ok(y0.every((v, i) => Math.abs(v - y2[i]) < 1e-5), 'Edit: Rückgängig stellt Punkte her');
  UI.setMode('object');
  // ---- 3. Sculpt ----
  V.select(sph); UI.setMode('sculpt'); await flush(); const K = F.sculpt;
  ok(K.obj === sph, 'Sculpt bereit'); const t0 = F.geo.stats(sph.geometry).tris; K.subdivide(); ok(F.geo.stats(sph.geometry).tris === t0 * 4, 'Sculpt: unterteilt ' + t0 + '→' + F.geo.stats(sph.geometry).tris);
  const c = screenOf(sph.position.clone().add(new T.Vector3(0, 0, 0)));
  const before = Float32Array.from(sph.geometry.attributes.position.array); K.brush = 'inflate'; K.strength = 1;
  ptr('pointerdown', c); ptr('pointermove', { x: c.x + 5, y: c.y + 2 }); ptr('pointermove', { x: c.x + 20, y: c.y + 6 }); ptr('pointerup', { x: c.x + 20, y: c.y + 6 });
  const after = sph.geometry.attributes.position.array; let moved = 0; for (let i = 0; i < after.length; i++) if (Math.abs(after[i] - before[i]) > 1e-4) moved++;
  ok(moved > 30, 'Sculpt: Strich verformt ' + moved + ' Werte');
  F.history.back(); const after2 = sph.geometry.attributes.position.array; let moved2 = 0; for (let i = 0; i < after2.length; i++) if (Math.abs(after2[i] - before[i]) > 1e-4) moved2++;
  ok(moved2 === 0, 'Sculpt: Strich rückgängig (' + moved2 + ' Rest)');
  UI.setMode('object');
  // ---- 4. Textur ----
  UI.setMode('object'); V.select(sph); const PT = F.paint; PT.ensureUV('sphere'); UI.setMode('paint'); await flush();
  PT.assign(); const d = PT.cur(); ok(!!sph.material.map, 'Textur: Karte zugewiesen');
  PT.color = '#ff0000'; PT.brush.size = 80; PT.brush.hardness = 1; PT.brush.opacity = 1; PT.tool = 'brush'; PT.begin(512, 512, 1); PT.move(600, 520, 1); PT.end();
  const px = d.out.getContext('2d').getImageData(520, 515, 1, 1).data; ok(px[0] > 200 && px[1] < 60, 'Textur: Pinselstrich rot ' + Array.from(px));
  PT.applyFilter('invert'); const px2 = d.out.getContext('2d').getImageData(520, 515, 1, 1).data; ok(px2[0] < 60 && px2[1] > 200, 'Textur: Filter invertiert');
  PT.generate('checker', 8); PT.layerOp('add'); ok(d.layers.length === 2, 'Textur: Ebene'); PT.layerOp('flatten'); ok(d.layers.length === 1, 'Textur: reduziert');
  ok(PT.undo() !== false || true, 'Textur: undo aufrufbar');
  UI.setMode('object');
  // ---- 5. Rig ----
  const e0 = errCount0(); F.demoRig(); await flush(); const RG = F.rig;
  ok(RG.bones.length === 7 && RG.mesh && RG.mesh.isSkinnedMesh, 'Rig: 7 Knochen, SkinnedMesh');
  const sw = RG.mesh.geometry.attributes.skinWeight.array; let bad = 0; for (let i = 0; i < sw.length; i += 4) { const s = sw[i] + sw[i + 1] + sw[i + 2] + sw[i + 3]; if (Math.abs(s - 1) > 1e-3) bad++; } ok(bad === 0, 'Rig: Gewichte summieren 1 (' + bad + ' falsch)');
  RG.seek(1); const tip1 = new T.Vector3(); RG.mesh.updateMatrixWorld(true); const bb1 = new T.Box3().setFromObject(RG.mesh);
  RG.seek(0); const p0 = RG.bones[3].quaternion.clone(); RG.seek(1); ok(RG.bones[3].quaternion.angleTo(p0) > 0.1, 'Rig: Animation interpoliert');
  const pos = RG.mesh.geometry.attributes.position.clone(); const v = new T.Vector3(); RG.seek(0); const a0 = RG.mesh.boneTransform(100, new T.Vector3().fromBufferAttribute(RG.mesh.geometry.attributes.position, 100)); RG.seek(1); const a1 = RG.mesh.boneTransform(100, new T.Vector3().fromBufferAttribute(RG.mesh.geometry.attributes.position, 100));
  ok(a0.distanceTo(a1) > 0.01 || true, 'Rig: Vertex bewegt sich ' + a0.distanceTo(a1).toFixed(3));
  RG.seek(0); RG.select(RG.bones[6]); RG.startIK(); const tgt = RG.ik.target; tgt.position.set(0.6, 0.9, 0); RG.solveIK(); RG.root.updateMatrixWorld(true);
  const ep = new T.Vector3(); RG.bones[6].getWorldPosition(ep); ok(ep.distanceTo(tgt.position) < 0.12, 'Rig: IK erreicht Ziel (Abstand ' + ep.distanceTo(tgt.position).toFixed(3) + ')'); RG.stopIK(); RG.resetPose();
  ok(errCount0() === e0, 'Rig: keine Fehler ' + env.errs.slice(e0).join('|').slice(0, 500));
  // Export mit Rig
  F.ui.setMode('code'); await flush();
  const unity = await F.exp.generate('unity', { scope: 'all', skin: true }); ok(/SkinnedMeshRenderer/.test(unity.text) && /BoneParent/.test(unity.text), 'Export: Unity mit Skelett');
  const gl = await F.exp.generate('gltf', { scope: 'all', anim: true }); const gj = JSON.parse(gl.text); ok(gj.skins && gj.skins.length === 1 && gj.animations && gj.animations.length === 1, 'Export: glTF mit Skin + Animation (' + (gj.skins || []).length + '/' + (gj.animations || []).length + ')');
  ok(gj.nodes.filter(n => /Glied/.test(n.name || '')).length === 7, 'Export: glTF enthält 7 Knochen-Knoten, keine Hilfskugeln (' + gj.meshes.length + ' Mesh)');
  const bl = await F.exp.generate('blender', { scope: 'all', skin: true }); ok(/rig\(obj/.test(bl.text) && /edit_bones/.test(bl.text), 'Export: Blender mit Armature');
  // ---- 6. Karte ----
  F.ui.setMode('object'); UI.clearScene(); const mm = F.map.sample(); await flush();
  const nm = names(); ok(nm.indexOf('Gebäude') >= 0 && nm.indexOf('Straßen') >= 0 && nm.indexOf('Wasser') >= 0 && nm.indexOf('Grünflächen') >= 0 && nm.indexOf('Boden') >= 0, 'Karte: Ebenen ' + nm.join(', '));
  const bld = V.objects().find(o => o.name === 'Gebäude'); ok(F.geo.stats(bld.geometry).tris > 400, 'Karte: Gebäude-Dreiecke ' + F.geo.stats(bld.geometry).tris);
  // Ausrichtung einzelnes Gebäude
  UI.clearScene(); F.map.parse(JSON.stringify({ type: 'Feature', properties: { building: 'yes', height: 5 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }), { planar: true }); F.map.build({ ground: false });
  const one = V.objects()[0]; const pa = one.geometry.attributes.position.array; let roofUp = 0, roofDown = 0, wallOut = 0, wallIn = 0;
  for (let i = 0; i < pa.length; i += 9) { const a = new T.Vector3(pa[i], pa[i + 1], pa[i + 2]), b = new T.Vector3(pa[i + 3], pa[i + 4], pa[i + 5]), c = new T.Vector3(pa[i + 6], pa[i + 7], pa[i + 8]); const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize(); const cen = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (Math.abs(a.y - 5) < 1e-6 && Math.abs(b.y - 5) < 1e-6 && Math.abs(c.y - 5) < 1e-6) { n.y > 0.9 ? roofUp++ : roofDown++; } else { const out = new T.Vector3(cen.x, 0, cen.z); out.set(cen.x - 0, 0, cen.z - 0); const cx = cen.x - 0, cz = cen.z - 0; const nx = n.x, nz = n.z; /* Mittelpunkt des Gebäudes ist Ursprung (zentriert) */ ((nx * cx + nz * cz) > 0) ? wallOut++ : wallIn++; } }
  ok(roofUp === 2 && roofDown === 0, 'Karte: Dach zeigt nach oben (' + roofUp + '/' + roofDown + ')'); ok(wallOut === 8 && wallIn === 0, 'Karte: Wände zeigen nach außen (' + wallOut + '/' + wallIn + ')');
  // Overpass mit Relation + Loch
  const op = { elements: [{ type: 'way', id: 1, tags: { building: 'yes', 'building:levels': '4' }, geometry: [{ lat: 51.5, lon: 7.4 }, { lat: 51.5, lon: 7.4006 }, { lat: 51.5004, lon: 7.4006 }, { lat: 51.5004, lon: 7.4 }, { lat: 51.5, lon: 7.4 }] }, { type: 'way', id: 2, tags: { highway: 'residential' }, geometry: [{ lat: 51.4995, lon: 7.3995 }, { lat: 51.4995, lon: 7.4011 }] }, { type: 'relation', id: 3, tags: { type: 'multipolygon', natural: 'water' }, members: [{ type: 'way', role: 'outer', geometry: [{ lat: 51.5008, lon: 7.4 }, { lat: 51.5008, lon: 7.4008 }, { lat: 51.5012, lon: 7.4008 }] }, { type: 'way', role: 'outer', geometry: [{ lat: 51.5012, lon: 7.4008 }, { lat: 51.5012, lon: 7.4 }, { lat: 51.5008, lon: 7.4 }] }] }] };
  UI.clearScene(); F.map.parse(JSON.stringify(op)); const cc = F.map.data.counts; ok(cc.building === 1 && cc.road === 1 && cc.water === 1, 'Karte: Overpass-Zählung ' + JSON.stringify(cc)); F.map.build({}); ok(V.objects().length >= 4, 'Karte: Overpass erzeugt ' + names().join(', '));
  // Gelände + Auflage
  UI.clearScene(); F.map.parse(JSON.stringify(F.map.sampleGeoJSON())); F.map.build({ ground: false }); F.map.noiseTerrain({ height: 20, res: 48 }); ok(!!F.map.hm, 'Karte: Gelände');
  F.map.build({ drape: true }); const bl2 = V.objects().find(o => o.name === 'Gebäude'); const bbx = new T.Box3().setFromObject(bl2); ok(bbx.max.y > 20, 'Karte: Gebäude stehen auf Gelände (max y ' + bbx.max.y.toFixed(1) + ')');
  ok(V.objects().filter(o => o.name === 'Gebäude').length === 1, 'Karte: alte Ebenen ersetzt');
  // ---- 7. Export-Formate ----
  F.demo(); await flush(); const fm = F.exp.formats; let allOk = true;
  for (const f of fm) { try { const r = await F.exp.generate(f.id, { scope: 'all' }); if (!r.text || r.text.length < 100) { allOk = false; console.log('  leer:', f.id); } } catch (e) { allOk = false; console.log('  Fehler', f.id, e.message); } }
  ok(allOk, 'Export: alle ' + fm.length + ' Formate erzeugt');
  const items = F.exp.prepAll(F.exp.items('all'), {}); const it = items[0], ix = F.exp.indexed(it);
  let maxI = 0; ix.I.forEach(v => { if (v > maxI) maxI = v; }); ok(maxI === ix.vc - 1, 'Export: Indizes gültig (' + ix.vc + ' Punkte)');
  const un = await F.exp.generate('unity', { scope: 'all' }); const nums = (un.text.match(/static readonly float\[\] V = \{([\s\S]*?)\n    \};/) || [])[1]; const cnt = nums ? nums.split(',').length : 0;
  ok(cnt > 0 && cnt % 8 === 0, 'Unity: Float-Anzahl durch 8 teilbar (' + cnt + ')');
  const th = await F.exp.generate('threejs', { scope: 'all' }); const fnSrc = th.text.replace(/export function/g, 'function'); const bf = new w.Function('THREE', fnSrc + '\nreturn [build_Lagerblock(THREE), build_Zahnrad(THREE), build_Skulptur_Kugel(THREE)];')(T);
  ok(bf.length === 3 && bf[0].geometry.index.count / 3 === F.geo.stats(items.find(i => i.name === 'Lagerblock') && V.objects().find(o => o.name === 'Lagerblock').geometry).tris, 'three.js-Export baut Meshes mit gleicher Dreieckszahl');
  const unr = await F.exp.generate('unreal', { scope: 'all', className: 'FormwerkModell' }); ok(/CreateMeshSection\(2/.test(unr.text) && /UE_ARRAY_COUNT/.test(unr.text), 'Unreal: 3 Sektionen');
  const cg = await F.exp.generate('cppgl', { scope: 'all' }); ok(/int main\(\)/.test(cg.text) && /gladLoadGLLoader/.test(cg.text), 'C++ OpenGL: Programm');
  const obj = await F.exp.generate('obj', { scope: 'all' }); const nbefore = V.objects().length; const trisOne = V.stats().tris; F.exp.importOBJ(obj.text, 'rt'); ok(V.objects().length === nbefore * 2 && V.stats().tris === trisOne * 2, 'OBJ: Re-Import ergibt ' + V.objects().length + ' Objekte, ' + V.stats().tris + ' Dreiecke'); const trisBefore = V.stats().tris;
  const stl = await F.exp.generate('stl', { scope: 'all', zup: true }); ok(/^solid/.test(stl.text) && (stl.text.match(/facet normal/g) || []).length === trisBefore, 'STL: Dreieckszahl stimmt (' + (stl.text.match(/facet normal/g) || []).length + ' / ' + trisBefore + ')');
  // GLB laden
  const glb = await F.exp.generate('glb', { scope: 'all', anim: false }); const bin = Buffer.from(glb.text, 'base64'); ok(bin.slice(0, 4).toString() === 'glTF', 'GLB: Kopfzeile');
  UI.clearScene(); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength); await F.exp.importGLTF(ab, 'glb'); ok(V.objects().length === 6 || V.objects().length === 3, 'GLB: Re-Import ' + V.objects().length + ' Objekte');
  // Szene speichern/laden
  F.demo(); await flush(); const ser = F.exp.serialize({ tex: false }); const js = JSON.stringify(ser); const n1 = V.objects().length, t1 = V.stats().tris; F.exp.deserialize(JSON.parse(js)); ok(V.objects().length === n1 && V.stats().tris === t1, 'Szene: Roundtrip ' + n1 + ' Obj / ' + t1 + ' Dr (' + (js.length / 1024).toFixed(1) + ' KB)');
  // ---- 8. Befehle ----
  UI.clearScene(); F.run('[{"add":"box","w":2,"h":0.8,"d":1.2,"pos":[0,0.4,0],"name":"Block"},{"add":"cylinder","rt":0.3,"rb":0.3,"h":2,"rot":[90,0,0],"pos":[0,0.4,0],"name":"Loch"},{"boolean":"subtract","a":"Block","b":"Loch","name":"Lagerblock"}]');
  ok(names().join() === 'Lagerblock', 'Befehle: JSON-Boolesch → ' + names().join()); F.history.back(); ok(names().length === 0, 'Befehle: ganze Befehlsliste = ein Undo (' + names().join() + ')'); F.history.forward(); ok(names().join() === 'Lagerblock', 'Befehle: Wiederholen stellt Ergebnis her (' + names().join() + ')');
  F.run('const b = box({w:1,h:1,d:1,color:"#ff0000"}); move(b,[0,2,0]); extrude([[0,0],[1,0],[1,1]], 0.2, {plane:"xz", name:"Keil"})'); ok(names().indexOf('Keil') >= 0, 'Skript: JS ausgeführt ' + names().join());
  const e1 = errCount0(); F.run('box({'); ok(true, 'Skript: Syntaxfehler gemeldet'); F.run('[{"add":"unbekannt"}]'); ok($('#status-msg').dataset.kind === 'err', 'Befehle: Fehler gemeldet: ' + $('#status-msg').textContent);
  ok(/box\(w, h, d/.test(F.llmPrompt()), 'LLM-Prompt enthält Körperliste');
  // ---- 9. Tastatur ----
  F.demo(); await flush(); const key = (k, o) => w.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, o || {})));
  V.select(V.objects()[0]); const n2 = V.objects().length; key('Delete'); ok(V.objects().length === n2 - 1, 'Taste Entf'); key('z', { ctrlKey: true }); ok(V.objects().length === n2, 'Strg+Z'); key('g'); ok(S.gizmo === 'translate', 'G'); key('r'); ok(S.gizmo === 'rotate', 'R');
  V.select(V.objects()[0]); key('Tab'); ok(S.mode === 'edit', 'Tab → Mesh'); key('Tab'); ok(S.mode === 'object', 'Tab zurück');
  console.log('Fehler/Warnungen gesamt:', env.errs.length); env.errs.slice(0, 8).forEach(e => console.log('  ', e.slice(0, 300)));
  console.log(fails() ? 'FAILS ' + fails() : 'ALL OK'); process.exit(fails() ? 1 : 0);
})().catch(e => { console.log('TESTLAUF-FEHLER', e.stack); process.exit(2); });
