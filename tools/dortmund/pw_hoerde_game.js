const { chromium } = require('playwright'); const fs = require('fs');
const URL = 'http://localhost:' + (process.env.PORT || 8099) + '/index.html', SH = __dirname + '/shots/'; fs.mkdirSync(SH, { recursive: true });
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage(); pg.setDefaultTimeout(300000);
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const settle = () => pg.waitForFunction(() => window.__v && window.__v.settled(), null, { timeout: 300000, polling: 50 });
  await pg.goto(URL + '?game=1&t=16.2&npc=500'); await pg.waitForFunction(() => window.__game && window.__game.car, null, { timeout: 120000 });
  await pg.evaluate(() => { const g = window.__game; g.setPos(3714, -520, -0.5); }); await settle(); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: SH + '20_spiel_mathilde_tag.png' });
  console.log(JSON.stringify(await pg.evaluate(() => ({ pos: [window.__game.car.x, window.__game.car.z], y: window.__game.car.y, crowd: window.__game.crowd() }))));
  await pg.evaluate(() => { const g = window.__game; g.setPos(4060, -775, -1.9); g.setTime(20.9); }); await pg.keyboard.press('KeyL'); await settle(); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: SH + '21_spiel_burgplatz_abend.png' });
  console.log('Fehler:', errs.length, errs.slice(0, 3)); await br.close();
})();
