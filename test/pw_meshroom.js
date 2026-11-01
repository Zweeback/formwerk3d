const { open } = require('./pwlib'); const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '../shots/meshroom'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const { br, pg, errs } = await open({ viewport: { width: 1500, height: 950 } });
  await pg.evaluate(() => window.Formwerk3D.ui.clearScene());
  const t0 = Date.now(); await pg.setInputFiles('#tools-top input[type=file]', path.join(__dirname, '../mr_test/meshroom_out.zip'));
  await pg.waitForFunction(() => window.Formwerk3D.view.objects().length > 0, null, { timeout: 120000 }); await pg.waitForTimeout(2500);
  const r1 = await pg.evaluate(() => { const F = window.Formwerk3D, o = F.view.objects()[0]; return { name: o.name, tris: F.geo.stats(o.geometry).tris, map: !!o.material.map, img: o.material.map && o.material.map.image ? o.material.map.image.width + 'x' + o.material.map.image.height : null, status: document.querySelector('#status-msg').textContent }; });
  console.log('Import', Date.now() - t0, 'ms', JSON.stringify(r1));
  const shot = async (name, pos, tg, shade) => { await pg.evaluate(([p, t, s]) => { const V = window.Formwerk3D.view; V.select(null); V.overlay.visible = false; V.scene.background = new THREE.Color(0xdfe3e8); V.setShading(s || 'solid'); V.cam.position.set(...p); V.controls.target.set(...t); V.cam.lookAt(...t); V.controls.update(); V.requestRender(); }, [pos, tg, shade]); await pg.waitForTimeout(700); const u = await pg.evaluate(() => window.Formwerk3D.api.screenshot()); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(u.split(',')[1], 'base64')); };
  await shot('1-import', [1.1, 0.9, 1.3], [0, 0.4, 0]);
  const r2 = await pg.evaluate(async () => { const F = window.Formwerk3D, o = F.view.objects()[0]; const t0 = performance.now(); try { const r = F.api.decimate(o, 0.1); return { ms: Math.round(performance.now() - t0), tris: F.geo.stats(F.view.objects()[0].geometry).tris, status: document.querySelector('#status-msg').textContent }; } catch (e) { return { FEHLER: e.message }; } });
  console.log('Decimate 10 %', JSON.stringify(r2));
  await shot('2-decimiert', [1.1, 0.9, 1.3], [0, 0.4, 0], 'solidwire');
  console.log(errs.filter(e => !/ERR_FAILED|font/i.test(e)).join('\n') || 'keine Fehler'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
