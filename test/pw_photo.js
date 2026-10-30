const { open } = require('./pwlib'); const path = require('path');
const arg = process.argv[2] || 'rtw', res = +(process.argv[3] || 128), tex = process.argv[4] !== 'notex';
(async () => {
  const { br, pg, errs } = await open({ viewport: { width: 1280, height: 800 } });
  await pg.evaluate(a => { const F = window.Formwerk3D; if (a === 'rtw') F.demoAmbulance(); else F.ui.sceneAction(a === 'demo' ? 'demo' : 'rig'); }, arg);
  await pg.waitForTimeout(1500);
  let t0 = Date.now();
  const sim = await pg.evaluate(async () => { const F = window.Formwerk3D; const objs = F.view.objects().length; await F.photo.addSimulated({ n: 24, elev: 22, f35: 30 }); const P = F.photo; return { objs, views: P.views.length, areas: P.views.map(v => +(v.area / (v.w * v.h)).toFixed(2)), warns: P.views.map(v => v.warn).filter(Boolean), mode: F.state.mode }; });
  console.log('Simulation', (Date.now() - t0) + ' ms', JSON.stringify(sim));
  await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(__dirname, '../shots/photo-studio.png') });
  t0 = Date.now();
  const r = await pg.evaluate(async ({ res, tex }) => { const F = window.Formwerk3D, P = F.photo; P.cfg.res = res; P.cfg.tex = tex; const old = F.view.objects().slice(); old.forEach(o => o.visible = false); const m = await P.build(); if (!m) return { fail: document.querySelector('#status-msg').textContent }; const bb = new window.THREE.Box3().setFromObject(m), s = bb.getSize(new window.THREE.Vector3()); return { last: Object.assign({}, P.last, { obj: undefined }), size: s.toArray().map(x => +x.toFixed(3)), tris: F.geo.stats(m.geometry).tris, map: !!m.material.map, status: document.querySelector('#status-msg').textContent, truth: P.truth }; }, { res, tex });
  console.log('Build', (Date.now() - t0) + ' ms', JSON.stringify(r));
  await pg.waitForTimeout(600); await pg.screenshot({ path: path.join(__dirname, '../shots/photo-result.png') });
  for (const v of ['front', 'right', 'iso']) { await pg.evaluate(v => window.Formwerk3D.view.viewDir(v), v); await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(__dirname, '../shots/photo-result-' + v + '.png') }); }
  console.log('Fehler:', errs.length ? errs.join('\n  ') : 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
