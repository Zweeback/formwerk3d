const { open } = require('./pwlib'); const path = require('path');
const OUT = path.join(__dirname, '../shots/boolean');
(async () => {
  const { br, pg, errs } = await open({ viewport: { width: 1500, height: 1000 } });
  await pg.evaluate(async () => { const F = window.Formwerk3D; await F.manifold.init(); F.ui.clearScene(); F.demoAmbulance(); });
  const info = await pg.evaluate(() => { const F = window.Formwerk3D, o = F.view.objects().find(x => x.name === 'RTW Karosserie'); const m = o.material, g = o.geometry; return { type: m.type, color: m.color && m.color.getHexString(), vc: m.vertexColors, attrs: Object.keys(g.attributes), groups: g.groups.length, mats: Array.isArray(o.material) ? o.material.length : 1, map: !!m.map, ud: JSON.stringify(m.userData).slice(0, 200) }; });
  console.log(JSON.stringify(info));
  const shot = async (name, pos, tg, shade) => { await pg.evaluate(([p, t, s]) => { const V = window.Formwerk3D.view; V.select(null); V.overlay.visible = false; V.scene.background = new THREE.Color(0xdfe3e8); V.setShading(s || 'solid'); V.cam.position.set(...p); V.controls.target.set(...t); V.cam.lookAt(...t); V.controls.update(); V.requestRender(); }, [pos, tg, shade]); await pg.waitForTimeout(600); const u = await pg.evaluate(() => window.Formwerk3D.api.screenshot()); require('fs').writeFileSync(path.join(OUT, name + '.png'), Buffer.from(u.split(',')[1], 'base64')); };
  await shot('rtw-vorher', [5.2, 2.4, 6.4], [0, 1.4, 0.4]);
  const r = await pg.evaluate(() => { const F = window.Formwerk3D, V = F.view, o = V.objects().find(x => x.name === 'RTW Karosserie'); const bb = new THREE.Box3().setFromObject(o), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    // seitliches Fenster + Rundloch im Dach
    const w = F.api.box({ w: 1.2, h: 0.6, d: s.z * 1.2, pos: [c.x + s.x * 0.2, c.y + 0.2, c.z], name: 'Fensterschnitt' });
    const t0 = performance.now(); const r1 = F.boolean('subtract', o, w, false, 'Karosserie mit Fenster');
    return { ms: Math.round(performance.now() - t0), engine: F.csg.engine, tris: Math.round(r1.geometry.attributes.position.count / 3), color: r1.material.color.getHexString(), vc: r1.material.vertexColors, attrs: Object.keys(r1.geometry.attributes), n: V.objects().length }; });
  console.log(JSON.stringify(r));
  await shot('rtw-nachher', [5.2, 2.4, 6.4], [0, 1.4, 0.4]);
  await shot('rtw-nachher-draht', [3.6, 1.8, 4.6], [0, 1.4, 0.5], 'solidwire');
  console.log(errs.filter(e => !/ERR_FAILED|font/i.test(e)).join('\n') || 'keine Fehler'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
