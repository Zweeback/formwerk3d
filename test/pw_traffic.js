// Verkehr, Gehwege, Krankenhaus, Einsatzziele auf dem erweiterten Gebiet (Hörde): Messungen ohne Rendering + Bilder
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = process.env.PORT || 8102, URL = 'http://localhost:' + PORT + '/index.html', SH = process.env.SH || (__dirname + '/../shots/verkehr/'); fs.mkdirSync(SH, { recursive: true });
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage(); const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  pg.setDefaultTimeout(300000); const settle = () => pg.waitForFunction(() => window.__v.settled(), null, { timeout: 240000, polling: 50 }); const out = {};
  await pg.goto(URL + '?game=1&t=14.5'); await pg.waitForFunction(() => window.__game, null, { timeout: 120000 }); await settle(); await pg.waitForTimeout(1000);
  out.start = await pg.evaluate(() => ({ s: window.__game.state(), graph: window.__game.graph(), crowd: window.__game.crowd(), traffic: window.__game.traffic(), pedOnPath: window.__game.pedOnPath(), hosp: [window.__game.hosp.x, window.__game.hosp.z] }));
  // 90 Sekunden Simulation ohne Rendering (30 Hz), Auto steht
  out.sim = await pg.evaluate(() => { const g = window.__game; const r = { samples: [] }; const car = g.car; car.vx = car.vz = car.vf = 0; let tPre = performance.now();
    for (let i = 0; i < 90 * 30; i++) { g.trafficStep(1 / 30); g.crowdStep(1 / 30); if (i % 300 === 299) { const t = g.traffic(); r.samples.push({ t: Math.round((i + 1) / 30), n: t.n, bewegt: t.moving, imGebaeude: t.inBuilding, kmh: t.avgKmh, passPfad: g.pedOnPath(), pass: g.crowd().n }); } }
    r.rechenzeit_ms_je_Schritt = +((performance.now() - tPre) / (90 * 30)).toFixed(2); r.verkehr = g.traffic(); r.passanten = g.crowd();
    // Passanten im Gebäude?
    r.passantenImGebaeude = g.agents.filter(a => a.ok && g.occ(a.x, a.z)).length; return r; });
  // Einsatzziele: 12 Aufträge, alle auf befahrbarer Fläche und in 200–2500 m
  out.ziele = await pg.evaluate(() => { const g = window.__game, M = g.M, res = []; for (let i = 0; i < 12; i++) { g.newMission(); const t = M.target; res.push({ x: Math.round(t.x), z: Math.round(t.z), d: Math.round(Math.hypot(t.x - g.car.x, t.z - g.car.z)), main: g.inMain(t.x, t.z) }); } return { alleInMain: res.every(r => r.main), minD: Math.min(...res.map(r => r.d)), maxD: Math.max(...res.map(r => r.d)), xRange: [Math.min(...res.map(r => r.x)), Math.max(...res.map(r => r.x))], bsp: res.slice(0, 4) }; });
  // Anfahrt zum Krankenhaus: Abstand Krankenhaus ↔ nächstes Gebäude / Straße
  out.hospital = await pg.evaluate(() => { const g = window.__game; return { hosp: [Math.round(g.hosp.x), Math.round(g.hosp.z)], inMain: g.inMain(g.hosp.x, g.hosp.z), strasse: g.nearRoad(g.hosp.x, g.hosp.z, 50) }; });
  // Stoß mit einem Auto
  out.stoss = await pg.evaluate(() => { const g = window.__game, cars = g.TRc().filter(c => c.ok); const c = cars[0]; g.setPos(c.x - Math.sin(c.h) * 8, c.z - Math.cos(c.h) * 8, c.h); g.car.dmg = 0; g.car.impact = 0; const x0 = g.car.x; let maxPen = 0; for (let i = 0; i < 5 * 60; i++) { g.trafficStep(1 / 60); g.step(1 / 60, { up: 1, down: 0, left: 0, right: 0, hand: 0 }); const d = Math.hypot(g.car.x - c.x, g.car.z - c.z); maxPen = Math.max(maxPen, 3.4 - d); }
    return { schaeden: g.car.dmg, tempo_kmh: +(g.car.vf * 3.6).toFixed(1), bumps: g.traffic().bumps, maxEindringen_m: +maxPen.toFixed(2) }; });
  // Platz machen: Sirene an, Fahrt auf einer Straße, Autos voraus bremsen / weichen aus
  out.sirene = await pg.evaluate(() => { const g = window.__game; const cars = g.TRc().filter(c => c.ok); const c = cars[1]; g.setPos(c.x - Math.sin(c.h) * 25, c.z - Math.cos(c.h) * 25, c.h); g.car.vf = 12; g.car.vx = Math.sin(c.h) * 12; g.car.vz = Math.cos(c.h) * 12; g.car.siren = true; const y0 = g.traffic().yielded; for (let i = 0; i < 6 * 60; i++) { g.trafficStep(1 / 60); g.step(1 / 60, { up: 1, down: 0, left: 0, right: 0, hand: 0 }); } return { platzGemacht: g.traffic().yielded - y0, tempo_kmh: +(g.car.vf * 3.6).toFixed(1) }; });
  await pg.evaluate(() => { const g = window.__game; g.car.siren = false; g.reset(); g.setPos(3714, -552, 0); g.setTime(14.5); }); await settle(); await pg.waitForTimeout(1500); await pg.screenshot({ path: SH + '01_start_mathilde.png' });
  // Kamera hinter einem Auto auf einer Hauptstraße
  await pg.evaluate(() => { const g = window.__game, cars = g.TRc().filter(c => c.ok); cars.sort((a, b) => Math.hypot(a.x - 3714, a.z + 552) - Math.hypot(b.x - 3714, b.z + 552)); const c = cars[2]; g.setPos(c.x - Math.sin(c.h) * 14, c.z - Math.cos(c.h) * 14, c.h); }); await settle(); await pg.waitForTimeout(1500); await pg.screenshot({ path: SH + '02_hinter_auto.png' });
  console.log(JSON.stringify(out, null, 1)); console.log('Fehler:', errs.length, errs.slice(0, 6)); await br.close();
})().catch(e => { console.error('TESTFEHLER', e.message); process.exit(1); });
