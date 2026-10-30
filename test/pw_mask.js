const { open } = require('./pwlib'); const path = require('path');
(async () => {
  const { br, pg, errs } = await open();
  await pg.evaluate(() => window.Formwerk3D.demoAmbulance()); await pg.waitForTimeout(1000);
  await pg.evaluate(async () => { await window.Formwerk3D.photo.addSimulated({ n: 24, elev: 22, f35: 30 }); });
  for (const i of [3, 6, 9]) { await pg.evaluate(i => window.Formwerk3D.photo.select(i), i); await pg.waitForTimeout(300); const el = await pg.$('#pane-canvas'); await el.screenshot({ path: path.join(__dirname, '../shots/mask-' + i + '.png') }); }
  await br.close();
})();
