const { open } = require('./pwlib'); const path = require('path');
(async () => {
  const { br, pg, errs } = await open({ viewport: { width: 400, height: 800 } });
  for (const m of ['object', 'photo']) { await pg.evaluate(m => window.Formwerk3D.ui.setMode(m), m); await pg.waitForTimeout(500); const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); console.log(m, JSON.stringify(r)); await pg.screenshot({ path: path.join(__dirname, '../shots/phone-' + m + '.png') }); }
  console.log('Fehler:', errs.filter(e => !/ERR_FAILED/.test(e)).join('\n') || 'keine'); await br.close();
})();
