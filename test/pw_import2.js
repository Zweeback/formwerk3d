const { open } = require('./pwlib'); const path = require('path');
const S2 = path.join(__dirname, '../../samples2'), S = path.join(__dirname, '../../samples');
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['cube.dae', 'cube.3mf', 'karo.zip', 'fake.vrm', 'cloud.xyz', 'cloud.las', 'cloud.pcd', 'sphere.splat', 'torus-3dgs.ply'];
(async () => {
  const { br, pg, errs } = await open();
  for (const f of files) {
    await pg.evaluate(() => window.Formwerk3D.ui.clearScene());
    const t0 = Date.now(); const before = errs.length;
    await pg.setInputFiles('#tools-top input[type=file]', path.join(S2, f));
    await pg.waitForFunction(() => { const F = window.Formwerk3D; return F.view.objects().length > 0 || (F.pc && F.pc.layers.length > 0); }, null, { timeout: 60000 }).catch(() => {});
    await pg.waitForTimeout(1200);
    const r = await pg.evaluate(() => { const F = window.Formwerk3D, V = F.view, T = window.THREE, o = V.objects(); const bb = new T.Box3(); o.forEach(m => bb.expandByObject(m)); (F.pc ? F.pc.layers : []).forEach(L => bb.expandByObject(L.obj)); const s = bb.getSize(new T.Vector3());
      return { objs: o.map(m => m.name + ' tris=' + F.geo.stats(m.geometry).tris + ' map=' + !!m.material.map + ' vc=' + !!m.material.vertexColors), layers: F.pc.layers.map(L => L.name + ' ' + L.kind + ' n=' + L.n + '/' + L.total), size: s.toArray().map(v => +v.toFixed(2)), status: document.querySelector('#status-msg').textContent }; });
    console.log('\n' + f, (Date.now() - t0) + ' ms\n ', JSON.stringify(r));
    if (errs.length > before) console.log('  FEHLER:', errs.slice(before).join('\n   '));
    await pg.screenshot({ path: path.join(__dirname, '../shots/imp2-' + f.replace(/\./g, '-') + '.png') });
  }
  console.log('\nFehler gesamt:', errs.length ? errs.join('\n  ') : 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
