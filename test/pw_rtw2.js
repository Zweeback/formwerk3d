const { open } = require('./pwlib'); const path = require('path');
(async () => {
  const { br, pg, errs } = await open({ viewport: { width: 1280, height: 900 } });
  await pg.evaluate(() => { const F = window.Formwerk3D; F.demoAmbulance(); F.view.select(null); });
  const views = { photo: [[3.3, 1.55, 5.6], [0, 1.25, 0.6]], rear: [[-3.4, 1.8, -5.6], [0, 1.2, 0]], cab: [[2.4, 1.3, 3.8], [0, 1.2, 2.0]], wheel: [[2.2, 0.5, 2.6], [0.8, 0.4, 1.6]], top: [[0.01, 9, 0.2], [0, 1.3, 0]] };
  for (const [n, [pos, tg]] of Object.entries(views)) {
    await pg.evaluate(([p, t]) => { const F = window.Formwerk3D, V = F.view; V.cam.position.set(...p); V.controls.target.set(...t); V.controls.update(); V.requestRender(); }, [pos, tg]);
    await pg.waitForTimeout(500);
    await (await pg.$('#vp canvas')).screenshot({ path: path.join(__dirname, '../shots/rtw2-' + n + '.png') });
  }
  console.log(errs.length ? errs.join('\n') : 'keine Fehler'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
