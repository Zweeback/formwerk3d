const { open } = require('./pwlib');
(async () => {
  const { br, pg, errs } = await open();
  await pg.evaluate(() => window.Formwerk3D.demoAmbulance()); await pg.waitForTimeout(1000);
  await pg.evaluate(async () => { await window.Formwerk3D.photo.addSimulated({ n: 24, elev: 22, f35: 30 }); });
  const r = await pg.evaluate(() => { const P = window.Formwerk3D.photo, T = P._t, vs = P.included(); T.azimuths(vs); const sub = vs.filter((v, i) => i % 2 === 0), lm = sub.map(v => T.lowMask(v, 72)); const out = [];
    for (const [el, f] of [[22, 30], [22, 26], [22, 35], [30, 30], [10, 30], [50, 20], [40, 30], [22, 20], [22, 50]]) { sub.forEach(v => { v.az = v.az0; v.daz = 0; }); const t0 = performance.now(); const s = T.coverageScore(sub, { elev: el, f35: f, D: T.initD(sub, f) }, lm, 1.4, 36); out.push([el, f, +s.toFixed(3), Math.round(performance.now() - t0)]); }
    return out; });
  console.log(JSON.stringify(r));
  console.log('Fehler:', errs.length ? errs.join('\n') : 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
