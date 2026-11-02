require('fs').mkdirSync(__dirname + '/shots', { recursive: true });
const { chromium } = require('playwright'); const fs = require('fs');
const URL = 'http://localhost:8099/index.html', SH = __dirname + '/shots/';
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage(); const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const settle = () => pg.waitForFunction(() => window.__v.settled(), null, { timeout: 90000, polling: 50 });
  pg.setDefaultTimeout(240000); const out = {}; const T0 = Date.now(); const lap = s => console.log('[' + ((Date.now() - T0) / 1000).toFixed(0) + ' s] ' + s);
  await pg.goto(URL + '?game=1&t=14.5'); await pg.waitForFunction(() => window.__game, null, { timeout: 60000 }); await settle(); await pg.waitForTimeout(1500);
  lap('Spiel geladen'); out.start = await pg.evaluate(() => window.__game.state()); await pg.screenshot({ path: SH + '10_fahren_tag.png' });
  // Physik: Vollgas 10 s, dann Kurve, ohne Rendering
  out.physik = await pg.evaluate(() => { const g = window.__game, r = {}; g.setPos(1502, -2400, 0); const run = (s, k) => { for (let i = 0; i < s * 60; i++) g.step(1 / 60, k); };
    // freie Richtung finden: längste Strecke ohne Kollision
    let best = 0, bh = 0; for (let a = 0; a < 360; a += 5) { const h = a * Math.PI / 180; let d = 0; while (d < 300 && !g.blocked(1502 + Math.sin(h) * d, -2400 + Math.cos(h) * d, h)) d += 2; if (d > best) { best = d; bh = h; } }
    r.freieStrecke_m = best; g.setPos(1502, -2400, bh); const x0 = g.car.x, z0 = g.car.z; run(6, { up: 1, down: 0, left: 0, right: 0, hand: 0 }); r.nach6s_kmh = +(g.car.vf * 3.6).toFixed(1); r.weg6s_m = +Math.hypot(g.car.x - x0, g.car.z - z0).toFixed(1);
    const h1 = g.car.h; run(1.5, { up: 1, down: 0, left: 1, right: 0, hand: 0 }); r.kurve_gradProSek = +(((g.car.h - h1) * 180 / Math.PI) / 1.5).toFixed(1); run(3, { up: 0, down: 1, left: 0, right: 0, hand: 0 }); r.nachBremsen_kmh = +(g.car.vf * 3.6).toFixed(1); return r; });
  // Kollision: auf nächstes Gebäude zufahren, nie eindringen
  out.kollision = await pg.evaluate(() => { const g = window.__game; let found = null; for (let a = 0; a < 360 && !found; a += 3) { const h = a * Math.PI / 180; for (let d = 20; d < 140; d += 2) { const x = 1502 + Math.sin(h) * d, z = -2400 + Math.cos(h) * d; if (g.occ(x, z)) { let ok = true; for (let e = 0; e < d - 6; e += 2) if (g.blocked(1502 + Math.sin(h) * e, -2400 + Math.cos(h) * e, h)) { ok = false; break; } if (ok) { found = { h, d }; } break; } } }
    if (!found) return { fehler: 'kein Gebäude in Reichweite' }; g.setPos(1502, -2400, found.h); g.car.dmg = 0; let pen = 0, maxv = 0; for (let i = 0; i < 20 * 60; i++) { g.step(1 / 60, { up: 1, down: 0, left: 0, right: 0, hand: 0 }); if (g.blocked(g.car.x, g.car.z, g.car.h)) pen++; maxv = Math.max(maxv, Math.abs(g.car.vf)); }
    return { abstandZumGebaeude_m: found.d, schritteImGebaeude: pen, hoechsttempo_kmh: +(maxv * 3.6).toFixed(0), endtempo_kmh: +(g.car.vf * 3.6).toFixed(1), schaeden: g.car.dmg }; });
  // Mission: Patient aufnehmen, Krankenhaus, Wertung
  out.mission = await pg.evaluate(() => { const g = window.__game, M = g.M, log = []; g.reset(); g.newMission(); log.push(M.state); const t = M.target; log.push('Ziel ' + Math.round(t.x) + ',' + Math.round(t.z) + ' Zeit ' + Math.round(M.time) + ' s');
    g.setPos(t.x, t.z, 0); for (let i = 0; i < 5; i++) g.missionStep(0.5); log.push(M.state); for (let i = 0; i < 6; i++) g.missionStep(0.5); log.push(M.state); const hz = M.target; g.setPos(hz.x, hz.z, 0); g.missionStep(0.5); log.push(M.state + ' Punkte ' + M.score);
    return { log, hospInMain: g.inMain(g.hosp.x, g.hosp.z), hosp: [g.hosp.x, g.hosp.z] }; });
  // Bilder: Mission-Start, Dämmerung, Nacht mit Sirene
  await pg.evaluate(() => { const g = window.__game; g.reset(); g.setPos(1502, -2400, 0.8); g.setTime(14.5); }); await settle(); await pg.waitForTimeout(1200); await pg.screenshot({ path: SH + '11_fahren_tag2.png' });
  await pg.evaluate(() => { const g = window.__game; g.setTime(19.7); g.car.siren = true; }); await pg.waitForTimeout(2500); await pg.screenshot({ path: SH + '12_fahren_daemmerung.png' });
  await pg.evaluate(() => { window.__game.setTime(23.0); }); await pg.waitForTimeout(2500); await pg.screenshot({ path: SH + '13_fahren_nacht.png' });
  console.log(JSON.stringify(out, null, 1)); console.log('Fehler:', errs.length, errs.slice(0, 6)); await br.close();
})().catch(e => { console.error('TESTFEHLER', e.message); process.exit(1); });
