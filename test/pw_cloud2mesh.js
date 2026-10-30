const { open } = require('./pwlib'); const path = require('path');
const S2 = path.join(__dirname, '../../samples2');
(async () => {
  const { br, pg, errs } = await open();
  for (const f of ['torus-3dgs.ply', 'cloud.xyz', 'sphere.splat']) {
    await pg.evaluate(() => window.Formwerk3D.ui.clearScene());
    await pg.setInputFiles('#tools-top input[type=file]', path.join(S2, f));
    await pg.waitForFunction(() => window.Formwerk3D.pc.layers.length > 0, null, { timeout: 30000 });
    await pg.waitForTimeout(500);
    const t0 = Date.now();
    const r = await pg.evaluate(async () => { const F = window.Formwerk3D, L = F.pc.layers[0]; const geo = await F.pc.toMesh(L, { res: 90, thr: 1, smooth: 3 }); F.exp.addCloudMesh(geo, 'Netz'); const o = F.view.objects(); return { ret: geo.index.count / 3, objs: o.map(m => m.name + ' ' + JSON.stringify(F.geo.stats(m.geometry))), status: document.querySelector('#status-msg').textContent }; });
    console.log(f, (Date.now() - t0) + ' ms', JSON.stringify(r));
    await pg.evaluate(() => { const F = window.Formwerk3D; F.pc.layers.forEach(L => L.obj.visible = false); F.view.requestRender(); }); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(__dirname, '../shots/c2m-' + f.replace(/\./g, '-') + '.png') });
  }
  // Export-Panel mit Wolkenabschnitt
  await pg.evaluate(() => window.Formwerk3D.ui.clearScene());
  await pg.setInputFiles('#tools-top input[type=file]', path.join(S2, 'sphere.splat')); await pg.waitForFunction(() => window.Formwerk3D.pc.layers.length > 0); 
  await pg.click('text=Export'); await pg.waitForTimeout(600); await pg.screenshot({ path: path.join(__dirname, '../shots/c2m-exportpanel.png') });
  console.log('Fehler:', errs.length ? errs.join('\n  ') : 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
