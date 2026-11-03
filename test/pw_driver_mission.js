// Driver: Auftragsablauf (Crew abholen → Fluchtfahrt → Versteck / Festnahme / Totalschaden) + Fahndungs-Statistik
const { chromium } = require('playwright'); const PORT = process.env.PORT || 8102;
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 640, height: 360 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.setDefaultTimeout(300000);
  await pg.goto('http://localhost:' + PORT + '/index.html?game=1&mode=driver&t=14.5'); await pg.waitForFunction(() => window.__game, null, { timeout: 120000 }); await pg.waitForFunction(() => window.__v.settled(), null, { timeout: 240000, polling: 100 });
  const r = await pg.evaluate(() => { const g = window.__game, M = g.M, car = g.car, idle = { up: 0, down: 0, left: 0, right: 0, hand: 0 }, log = [], res = {};
    const tick = (s) => { for (let i = 0; i < s * 30; i++) { g.copStep(1 / 30); g.trafficStep(1 / 30); g.step(1 / 60, idle); g.step(1 / 60, idle); g.driverMissionStep(1 / 30); } };
    // 1) Erfolgsfall: Crew abholen, Fluchtfahrt, ankommen
    g.driverNewMission(); log.push(M.state); let t = M.target; res.ziel1 = [Math.round(t.x), Math.round(t.z)]; g.setPos(t.x, t.z, 0); car.vx = car.vz = car.vf = 0; tick(1); log.push(M.state); tick(2.5); log.push(M.state + ' heat ' + Math.round(g.driver().heat));
    const t2 = M.target; res.ziel2 = [Math.round(t2.x), Math.round(t2.z)]; res.fluchtZeit = Math.round(M.time); g.cops.forEach(c => c.ok = false); g.setHeat(0); g.setPos(t2.x, t2.z, 0); car.vx = car.vz = car.vf = 0; car.hp = 100; tick(0.5); log.push(M.state + ' Punkte ' + M.score + ' gesamt ' + M.total); res.erfolg = log.slice();
    // 2) nächster Auftrag startet von selbst
    tick(8); res.naechster = M.state + ' count ' + M.count;
    // 3) Festnahme: Crew an Bord, Polizei, Spieler steht
    t = M.target; g.setPos(t.x, t.z, 0); car.vx = car.vz = car.vf = 0; tick(4); res.zustandVorFestnahme = M.state; let bt = null; for (let i = 0; i < 90 * 30; i++) { g.copStep(1 / 30); g.trafficStep(1 / 30); g.step(1 / 60, idle); g.step(1 / 60, idle); g.driverMissionStep(1 / 30); if (M.state === 'busted') { bt = +(i / 30).toFixed(1); break; } if (M.state === 'failed') { bt = 'failed@' + (i / 30).toFixed(1); break; } } res.festnahme = M.state + ' nach ' + bt + ' s';
    // 4) Totalschaden
    tick(8); res.naechster2 = M.state; t = M.target; g.setPos(t.x, t.z, 0); car.vx = car.vz = car.vf = 0; tick(4); car.hp = 0; tick(0.2); res.totalschaden = M.state;
    return res; });
  console.log(JSON.stringify(r, null, 1)); console.log('Fehler', errs); await br.close();
})().catch(e => { console.error('TESTFEHLER', e.message); process.exit(1); });
