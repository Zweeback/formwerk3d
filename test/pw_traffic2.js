// Gezielte Prüfung: Stoß mit stehendem Auto, Platz machen mit Sirene, Anfahrt auf Straße (ohne Rendern)
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 640, height: 360 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  pg.setDefaultTimeout(300000); await pg.goto('http://localhost:' + (process.env.PORT || 8102) + '/index.html?game=1&t=14.5'); await pg.waitForFunction(() => window.__game && window.__v.settled(), null, { timeout: 240000, polling: 100 }); await pg.waitForTimeout(500);
  const out = {};
  out.stoss = await pg.evaluate(() => { const g = window.__game, c = g.TRc().filter(c => c.ok)[0]; c.hold = 30; c.v = 0; const fx = Math.sin(c.h), fz = Math.cos(c.h);
    g.setPos(c.x - fx * 14, c.z - fz * 14, c.h); g.car.dmg = 0; g.car.impact = 0; const b0 = g.traffic().bumps; let minD = 99, maxv = 0;
    for (let i = 0; i < 4 * 60; i++) { g.trafficStep(1 / 60); g.step(1 / 60, { up: 1, down: 0, left: 0, right: 0, hand: 0 }); minD = Math.min(minD, Math.hypot(g.car.x - c.x, g.car.z - c.z)); maxv = Math.max(maxv, Math.abs(g.car.vf)); }
    return { bumps: g.traffic().bumps - b0, schaeden: g.car.dmg, kleinsterAbstand_m: +minD.toFixed(2), hoechsttempo_kmh: +(maxv * 3.6).toFixed(0), endtempo_kmh: +(g.car.vf * 3.6).toFixed(1) }; });
  out.sirene = await pg.evaluate(() => { const g = window.__game, cars = g.TRc().filter(c => c.ok); const c = cars[3]; const fx = Math.sin(c.h), fz = Math.cos(c.h); g.setPos(c.x - fx * 28, c.z - fz * 28, c.h); g.car.vf = 12; g.car.vx = fx * 12; g.car.vz = fz * 12; g.car.siren = true;
    const v0 = c.v; let vmin = 99; for (let i = 0; i < 4 * 60; i++) { g.car.vf = 12; g.car.vx = fx * 12; g.car.vz = fz * 12; g.trafficStep(1 / 60); vmin = Math.min(vmin, c.v); } g.car.siren = false; let v1 = c.v; for (let i = 0; i < 6 * 60; i++) g.trafficStep(1 / 60);
    return { tempoVorher_kmh: +(v0 * 3.6).toFixed(0), tempoMitSirene_kmh: +(vmin * 3.6).toFixed(0), tempoNachher_kmh: +(c.v * 3.6).toFixed(0), platzGemacht: g.traffic().yielded }; });
  console.log(JSON.stringify(out)); console.log('Fehler', errs); await br.close();
})().catch(e => { console.error('TESTFEHLER', e.message); process.exit(1); });
