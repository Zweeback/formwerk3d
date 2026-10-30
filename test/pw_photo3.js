// Echte Dateipfade: Testfotos als PNG speichern, über den Importieren-Knopf laden, Modell bauen
const { open } = require('./pwlib'); const path = require('path'), fs = require('fs');
const D = path.join(__dirname, '../../samples3'); fs.mkdirSync(D, { recursive: true });
(async () => {
  const { br, pg, errs } = await open();
  await pg.evaluate(() => window.Formwerk3D.demoAmbulance()); await pg.waitForTimeout(800);
  const imgs = await pg.evaluate(async () => { const r = await window.Formwerk3D.photo.simulate({ n: 20, elev: 25, f35: 28, w: 960, h: 720 }); return r.canvases.map(c => c.toDataURL('image/jpeg', 0.92)); });
  imgs.forEach((d, i) => fs.writeFileSync(path.join(D, 'IMG_' + String(i + 1).padStart(3, '0') + '.jpg'), Buffer.from(d.split(',')[1], 'base64')));
  await pg.evaluate(() => window.Formwerk3D.ui.clearScene());
  const files = fs.readdirSync(D).filter(f => /\.jpg$/.test(f)).sort().map(f => path.join(D, f));
  await pg.setInputFiles('#tools-top input[type=file]', files);
  await pg.waitForFunction(() => window.Formwerk3D.photo.views.length >= 20, null, { timeout: 60000 });
  const r = await pg.evaluate(async () => { const F = window.Formwerk3D, P = F.photo; P.cfg.res = 128; P.cfg.tex = true; const m = await P.build(); return { mode: F.state.mode, views: P.views.length, names: P.views.slice(0, 3).map(v => v.name), last: P.last && Object.assign({}, P.last, { obj: undefined }), tris: m && F.geo.stats(m.geometry).tris, status: document.querySelector('#status-msg').textContent }; });
  console.log(JSON.stringify(r));
  for (const v of ['left', 'iso']) { await pg.evaluate(v => window.Formwerk3D.view.viewDir(v), v); await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(__dirname, '../shots/photo3-' + v + '.png') }); }
  console.log('Fehler:', errs.length ? errs.join('\n') : 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
