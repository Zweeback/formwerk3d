const { open } = require('./pwlib'); const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '../shots/boolean');
(async () => {
  const { br, pg, errs } = await open({ viewport: { width: 1500, height: 1000 } });
  const st = await pg.evaluate(async () => { const F = window.Formwerk3D; await F.manifold.init(); return { lib: !!F.manifold.lib, err: F.manifold.error, ver: F.manifold.version }; });
  console.log('Manifold:', JSON.stringify(st));
  const T = (name, fn, arg) => pg.evaluate(async ([src, a]) => { const F = window.Formwerk3D; const t0 = performance.now(); try { const r = await (new Function('F', 'a', 'return (' + src + ')(F,a)'))(F, a); return Object.assign({ ms: Math.round(performance.now() - t0), engine: F.csg.engine, note: F.csg.note }, r || {}); } catch (e) { return { ms: Math.round(performance.now() - t0), FEHLER: e.message, engine: F.csg.engine, note: F.csg.note }; } }, [fn.toString(), arg]).then(r => { console.log(name, JSON.stringify(r)); return r; });
  const shot = async (name, pos, tg, shade) => { await pg.evaluate(([p, t, s]) => { const V = window.Formwerk3D.view; V.select(null); V.overlay.visible = false; V.scene.background = new THREE.Color(0xdfe3e8); V.setShading(s || 'solid'); V.cam.position.set(...p); V.controls.target.set(...t); V.cam.lookAt(...t); V.controls.update(); V.requestRender(); }, [pos, tg, shade]); await pg.waitForTimeout(600); const u = await pg.evaluate(() => window.Formwerk3D.api.screenshot()); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(u.split(',')[1], 'base64')); };
  // 1) klein: Block minus Bohrung
  await T('klein', (F) => { F.ui.clearScene(); F.api.box({ w: 2, h: 0.8, d: 1.2, pos: [0, 0.4, 0], name: 'Block' }); F.api.cylinder({ rt: 0.3, rb: 0.3, h: 2, rot: [90, 0, 0], pos: [0, 0.4, 0], name: 'Loch' }); const r = F.api.subtract('Block', 'Loch', { name: 'Lager' }); const g = r.geometry; return { tris: g.attributes.position.count / 3 }; });
  await shot('klein', [2.6, 1.8, 3.2], [0, 0.4, 0]);
  // 2) groß: zwei Kugeln mit je ~82.000 Dreiecken (früher unmöglich: Grenze 14.000)
  for (const op of ['union', 'subtract', 'intersect']) {
    const r = await T('gross-' + op, (F, op) => { F.ui.clearScene(); const a = F.api.sphere({ r: 1, ws: 300, hs: 150, pos: [-0.5, 1, 0], name: 'A' }), b = F.api.sphere({ r: 1, ws: 300, hs: 150, pos: [0.6, 1.1, 0.3], name: 'B' }); const ta = a.geometry.index ? a.geometry.index.count / 3 : a.geometry.attributes.position.count / 3; const res = F.api[op]('A', 'B', { name: 'E' }); const g = res.geometry; return { eingabeTris: Math.round(ta) * 2, tris: Math.round(g.attributes.position.count / 3) }; }, op);
    if (op === 'subtract') await shot('gross-subtract', [3.2, 2.4, 4.2], [0, 1, 0]);
    if (op === 'union') await shot('gross-union', [3.2, 2.4, 4.2], [0, 1, 0]);
  }
  // 3) Rettungswagen: welche Teile sind wasserdicht? Aufschnitt mit Zylinder
  await pg.evaluate(() => { const F = window.Formwerk3D; F.ui.clearScene(); F.demoAmbulance(); });
  const parts = await pg.evaluate(() => window.Formwerk3D.view.objects().map(o => ({ n: o.name, t: Math.round(o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3) })).sort((a, b) => b.t - a.t).slice(0, 8));
  console.log('größte Teile:', JSON.stringify(parts));
  for (const p of parts.slice(0, 4)) await T('rtw-' + p.n, (F, name) => { const V = F.view, o = V.objects().find(x => x.name === name); const bb = new THREE.Box3().setFromObject(o), c = bb.getCenter(new THREE.Vector3()); F.api.cylinder({ rt: 0.25, rb: 0.25, h: 4, rot: [0, 0, 90], pos: [c.x, c.y, c.z + 0.3], name: 'Schnitt' }); const m = F.csg.runManifold('subtract', o, V.objects().find(x => x.name === 'Schnitt')); V.objects().filter(x => x.name === 'Schnitt').forEach(x => V._detach(x)); return { tris: Math.round(m.attributes.position.count / 3) }; }, p.n);
  await T('rtw-schnitt-echt', (F) => { const V = F.view, o = V.objects().find(x => x.name === 'RTW Karosserie'); const bb = new THREE.Box3().setFromObject(o), c = bb.getCenter(new THREE.Vector3()); F.api.cylinder({ rt: 0.45, rb: 0.45, h: 4, rot: [0, 0, 90], pos: [c.x, c.y + 0.1, c.z + 0.5], name: 'Schnitt' }); const r = F.boolean('subtract', o, V.objects().find(x => x.name === 'Schnitt'), false, 'Karosserie mit Loch'); return { tris: Math.round(r.geometry.attributes.position.count / 3) }; });
  await shot('rtw-schnitt', [5.2, 2.4, 6.4], [0, 1.4, 0.4]);
  await shot('rtw-schnitt-draht', [3.4, 1.8, 4.6], [0, 1.4, 0.5], 'solidwire');
  console.log(errs.filter(e => !/ERR_FAILED|font/i.test(e)).join('\n') || 'keine Fehler'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
