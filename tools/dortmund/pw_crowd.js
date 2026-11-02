require('fs').mkdirSync(__dirname + '/shots', { recursive: true });
const { chromium } = require('playwright');
const URL = 'http://localhost:8099/index.html', SH = __dirname + '/shots/';
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage(); pg.setDefaultTimeout(240000); const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const settle = () => pg.waitForFunction(() => window.__v.settled(), null, { timeout: 90000, polling: 50 });
  await pg.goto(URL + '?game=1&t=14.5&npc=600'); await pg.waitForFunction(() => window.__game); await settle(); const out = {};
  // Streumuster der Passanten: nie in Gebäuden, bewegen sich, reagieren auf Fahrzeug und Sirene
  out.crowd = await pg.evaluate(() => { const g = window.__game, r = {}; g.setPos(1502, -2400, 0); for (let i = 0; i < 20 * 60; i++) g.crowdStep(1 / 60); const ok = g.agents.filter(a => a.ok); r.anzahl = ok.length; r.inGebaeuden = ok.filter(a => g.occ(a.x, a.z)).length; r.mittlererAbstand_m = +(ok.reduce((s, a) => s + Math.hypot(a.x - g.car.x, a.z - g.car.z), 0) / ok.length).toFixed(0);
    const p0 = ok.map(a => [a.x, a.z]); for (let i = 0; i < 10 * 60; i++) g.crowdStep(1 / 60); r.laufenWeiter_m = +(ok.reduce((s, a, i) => s + Math.hypot(a.x - p0[i][0], a.z - p0[i][1]), 0) / ok.length).toFixed(1); r.zeit_ms_proSchritt = g.crowd().ms;
    // Ausweichen: Fahrzeug mit Sirene fährt 15 s auf eine Gruppe zu
    const a0 = ok[0]; g.setPos(a0.x - 25, a0.z - 25, Math.atan2(25, 25)); g.car.siren = true; g.car.vx = Math.sin(g.car.h) * 12; g.car.vz = Math.cos(g.car.h) * 12; for (let i = 0; i < 60; i++) { g.car.vx = Math.sin(g.car.h) * 12; g.car.vz = Math.cos(g.car.h) * 12; g.car.vf = 12; g.crowdStep(1 / 60); } const c = g.crowd(); r.flucht = { fliehenJetzt: c.flee, insgesamtAusgewichen: c.fled };
    // Anfahren
    const b0 = g.agents.find(a => a.ok && a.state === 'walk'); g.setPos(b0.x - 1.2, b0.z, Math.PI / 2); g.car.vx = 9; g.car.vz = 0; g.car.vf = 9; g.car.siren = false; const before = g.crowd().knocked; g.crowdStep(1 / 60); r.anfahren = { angefahren: g.crowd().knocked - before, schaeden: g.car.dmg }; return r; });
  await pg.evaluate(() => { const g = window.__game; g.setPos(1502, -2400, 0); g.car.vf = 0; g.car.vx = g.car.vz = 0; g.car.siren = true; for (let i = 0; i < 300; i++) g.crowdStep(1 / 60); }); await settle(); await pg.waitForTimeout(2500); await pg.screenshot({ path: SH + '14_passanten.png' });
  await pg.evaluate(() => { const g = window.__game; g.setTime(22.5); }); await pg.waitForTimeout(2500); await pg.screenshot({ path: SH + '15_nacht_blaulicht.png' });
  console.log(JSON.stringify(out, null, 1)); console.log('Fehler:', errs.length, errs.slice(0, 5)); await br.close();
})().catch(e => { console.error('TESTFEHLER', e.message); process.exit(1); });
