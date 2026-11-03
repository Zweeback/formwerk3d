const { chromium } = require('playwright'); const PORT = process.env.PORT || 8102;
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 640, height: 360 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.setDefaultTimeout(300000);
  await pg.goto('http://localhost:' + PORT + '/index.html?game=1&mode=driver&t=14.5'); await pg.waitForFunction(() => window.__game, null, { timeout: 120000 }); await pg.waitForFunction(() => window.__v.settled(), null, { timeout: 240000, polling: 100 });
  const r = await pg.evaluate(() => { const g = window.__game, car = g.car, res = []; const idle = { up: 0, down: 0, left: 0, right: 0, hand: 0 };
    for (let trial = 0; trial < 10; trial++) { for (const k in g.copStat) g.copStat[k] = 0; g.cops.forEach(c => c.ok = false); g.setHeat(70); car.vx = car.vz = car.vf = 0; let tNear = null, tBust = null, maxCops = 0;
      for (let i = 0; i < 90 * 30; i++) { g.copStep(1 / 30); g.trafficStep(1 / 30); g.step(1 / 60, idle); g.step(1 / 60, idle); const d = g.driver(); maxCops = Math.max(maxCops, d.cops); if (tNear === null && d.dists.length && Math.min(...d.dists) < 15) tNear = +(i / 30).toFixed(1); if (d.bustT > 3) { tBust = +(i / 30).toFixed(1); break; } if (d.heat <= 0) break; }
      res.push({ trial, tNear, tBust, maxCops, heat: +g.driver().heat.toFixed(0), stat: { ...g.copStat } }); }
    return res; });
  r.forEach(x => console.log(JSON.stringify(x))); console.log('Fehler', errs); await br.close();
})().catch(e => { console.error(e.message); process.exit(1); });
