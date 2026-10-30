const { open } = require('./pwlib'); const path = require('path');
(async () => {
  const { br, pg, errs } = await open({ viewport: { width: 1280, height: 800 } });
  const t0 = Date.now();
  const r = await pg.evaluate(() => { const F = window.Formwerk3D; const t = performance.now(); const o = F.demoAmbulance(); return { ms: Math.round(performance.now() - t), tris: o.tris, n: o.list.length, names: o.list.map(x => x.name) }; });
  console.log('RTW', r.ms + 'ms', r.tris, 'Dreiecke', r.n, 'Objekte'); console.log(r.names.join(' | '));
  const shot = async (n, dir) => { await pg.evaluate(d => { const F = window.Formwerk3D; F.view.viewDir(d); F.view.frame(); }, dir); await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(__dirname, '../shots/rtw-' + n + '.png') }); };
  await shot('iso', 'iso'); await shot('front', 'front'); await shot('left', 'left'); await shot('back', 'back'); await shot('top', 'top');
  console.log(errs.length ? errs.join('\n') : 'keine Fehler'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
