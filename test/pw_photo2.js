const { open } = require('./pwlib'); const path = require('path');
const mode = process.argv[2] || 'truth', res = +(process.argv[3] || 96);
(async () => {
  const { br, pg, errs } = await open();
  await pg.evaluate(() => window.Formwerk3D.demoAmbulance()); await pg.waitForTimeout(1000);
  await pg.evaluate(async (al) => { await window.Formwerk3D.photo.addSimulated({ n: 24, elev: 22, f35: 30, alpha: al }); }, process.argv[4] === 'alpha');
  const r = await pg.evaluate(async ({ mode, res }) => { const F = window.Formwerk3D, P = F.photo; P.cfg.res = res; P.cfg.tex = false;
    if (mode !== 'bbox') P.views.forEach(v => { v.pcx = v.w / 2; v.pcy = v.h / 2; });
    if (mode === 'truth' || mode === 'bbox0') { P.cfg.autoCal = false; P.cfg.elev = 22; P.cfg.f35 = 30; P.cfg.dir = 1; }
    P.cfg.refine = mode.indexOf('norefine') < 0 && mode !== 'truth';
    F.view.objects().forEach(o => o.visible = false); const m = await P.build(); if (!m) return { fail: document.querySelector('#status-msg').textContent }; const bb = new window.THREE.Box3().setFromObject(m), s = bb.getSize(new window.THREE.Vector3());
    return { last: Object.assign({}, P.last, { obj: undefined }), size: s.toArray().map(x => +x.toFixed(3)), tris: F.geo.stats(m.geometry).tris }; }, { mode, res });
  console.log(mode, JSON.stringify(r));
  await pg.evaluate(() => window.Formwerk3D.view.viewDir('iso')); await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(__dirname, '../shots/photo2-' + mode + '.png') });
  console.log('Fehler:', errs.length ? errs.join('\n') : 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
