// Driver-Modus: Limousine, Fahndung, Streifenwagen, Fluchtfahrt – Messungen ohne Rendern + Bilder
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = process.env.PORT || 8102, URL = 'http://localhost:' + PORT + '/index.html', SH = process.env.SH || (__dirname + '/../shots/driver/'); fs.mkdirSync(SH, { recursive: true });
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage(); const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  pg.setDefaultTimeout(300000); const settle = () => pg.waitForFunction(() => window.__v.settled(), null, { timeout: 240000, polling: 100 }); const out = {};
  await pg.goto(URL + '?game=1&mode=driver&t=14.5'); await pg.waitForFunction(() => window.__game, null, { timeout: 120000 }); await settle(); await pg.waitForTimeout(800);
  out.start = await pg.evaluate(() => { const g = window.__game; return { driver: g.DRIVER, s: g.state(), mission: g.M.state, ziel: g.M.target && [Math.round(g.M.target.x), Math.round(g.M.target.z)], cops: g.cops.length, traffic: g.traffic() }; });
  await pg.screenshot({ path: SH + '01_start_limousine.png' });
  // a) Stillstand: Fahndung 70, Auto steht → Streifenwagen kommen, stellen ihn, Festnahme
  out.stillstand = await pg.evaluate(() => { const g = window.__game, r = { t: [] }; g.setHeat(70); g.car.vx = g.car.vz = g.car.vf = 0; let first = null, bust = null;
    for (let i = 0; i < 120 * 30; i++) { g.copStep(1 / 30); g.trafficStep(1 / 30); g.step(1 / 60, { up: 0, down: 0, left: 0, right: 0, hand: 0 }); g.step(1 / 60, { up: 0, down: 0, left: 0, right: 0, hand: 0 }); const d = g.driver();
      if (first === null && d.cops > 0) first = i / 30; if (d.cops && Math.min(...d.dists) < 30 && r.near === undefined) r.near = +(i / 30).toFixed(1); if (!bust && d.bustT > 3) { bust = i / 30; break; } if (i % 150 === 149) r.t.push({ t: Math.round((i + 1) / 30), cops: d.cops, minD: d.dists.length ? Math.min(...d.dists) : null, heat: +d.heat.toFixed(0), bustT: +d.bustT.toFixed(1), imGebaeude: d.inBuilding }); }
    r.ersterPolizist_s = first; r.festnahme_s = bust; r.ende = g.driver(); return r; });
  // b) Flucht: Bot fährt dem Straßennetz entlang (Pure Pursuit), Polizei verfolgt
  out.flucht = await pg.evaluate(() => { const g = window.__game, DR = g.DRg(), car = g.car, r = { t: [] }; g.cops.forEach(c => c.ok = false); g.setHeat(70); car.dmg = 0; car.hp = 100;
    const rn = g.pathAt; const start = g.nearestDN(car.x, car.z); const dnAll = []; DR.adj.forEach((l, n) => { if (l.length) dnAll.push(n); });
    // weit entferntes Ziel (≈1,2 km)
    r.komponenten = g.comps(); let tgt = null; for (const n of dnAll) { if (DR.comp[n] !== DR.main) continue; const E = DR.adj[n][0]; const e = DR.E[E[0]]; const x = e.P[0], z = e.P[1]; const d = Math.hypot(x - car.x, z - car.z); if (d > 900 && d < 1400) { tgt = n; break; } }
    if (tgt === null) { r.fehler = 'kein Ziel'; return r; } const path = g.astar(start, tgt); if (!path.length) { r.fehler = 'keine Route'; return r; } const pts = []; for (const [ei, dir] of path) { const E = DR.E[ei]; for (let k = 0; k < E.n; k++) { const i = dir > 0 ? k : E.n - 1 - k; pts.push(E.P[2 * i], E.P[2 * i + 1]); } }
    r.routeLaenge_m = Math.round(path.reduce((s, p) => s + DR.E[p[0]].len, 0)); let ri = 0, minCop = 999, maxV = 0, hp0 = car.hp, stuck = 0, seenCops = 0; const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    g.setPos(pts[0], pts[1], Math.atan2(pts[2] - pts[0], pts[3] - pts[1]));
    for (let i = 0; i < 100 * 60; i++) { // 100 s
      while (ri < pts.length / 2 - 1 && Math.hypot(pts[2 * ri] - car.x, pts[2 * ri + 1] - car.z) < 12 + Math.abs(car.vf) * 0.5) ri++;
      const tx = pts[2 * ri], tz = pts[2 * ri + 1], dh = wrap(Math.atan2(tx - car.x, tz - car.z) - car.h), st = Math.max(-1, Math.min(1, dh * 2.2)), vt = 17 - Math.min(9, Math.abs(dh) * 10);
      g.step(1 / 60, { up: car.vf < vt ? 1 : 0, down: car.vf > vt + 3 ? 1 : 0, left: Math.max(0, st), right: Math.max(0, -st), hand: 0 });
      if (i % 2 === 0) { g.copStep(1 / 30); g.trafficStep(1 / 30); }
      maxV = Math.max(maxV, Math.abs(car.vf)); const d = g.driver(); if (d.cops) { minCop = Math.min(minCop, ...d.dists); seenCops = Math.max(seenCops, d.cops); }
      if (i % 600 === 599) r.t.push({ t: Math.round((i + 1) / 60), vKmh: +(car.vf * 3.6).toFixed(0), cops: d.cops, minD: d.dists.length ? Math.min(...d.dists) : null, heat: +d.heat.toFixed(0), hp: Math.round(d.hp), imGebaeude: d.inBuilding, wegpunkt: Math.round(100 * ri / (pts.length / 2)) + ' %' });
      if (ri >= pts.length / 2 - 2) { r.ziel_s = +(i / 60).toFixed(1); break; } }
    r.hoechsttempo_kmh = +(maxV * 3.6).toFixed(0); r.naechsterPolizist_m = Math.round(minCop); r.maxPolizisten = seenCops; r.hp = Math.round(car.hp); r.schaeden = car.dmg; r.ende = g.driver(); return r; });
  // Bilder: Streifenwagen im Rückspiegel-Blick, Blaulicht
  await pg.evaluate(() => { const g = window.__game; g.car.hp = 100; g.setHeat(80); g.cops.forEach(c => c.ok = false); const c = g.cops[0]; const car = g.car; c.x = car.x - Math.sin(car.h) * 14; c.z = car.z - Math.cos(car.h) * 14; c.h = car.h; c.v = 12; c.ok = true; c.retire = false; const c2 = g.cops[1]; c2.x = car.x - Math.sin(car.h) * 22 + Math.cos(car.h) * 3.5; c2.z = car.z - Math.cos(car.h) * 22 - Math.sin(car.h) * 3.5; c2.h = car.h; c2.v = 12; c2.ok = true; c2.retire = false; g.copDraw(); });
  await pg.waitForTimeout(600); await pg.screenshot({ path: SH + '02_polizei_hinten.png' });
  await pg.evaluate(() => { const g = window.__game, car = g.car; g.setTime(20.2); car.vf = 14; car.vx = Math.sin(car.h) * 14; car.vz = Math.cos(car.h) * 14; });
  await pg.waitForTimeout(1500); await pg.screenshot({ path: SH + '03_abend.png' });
  console.log(JSON.stringify(out)); console.log('Fehler', errs.length, errs.slice(0, 5)); await br.close();
})().catch(e => { console.error('TESTFEHLER', e.message); process.exit(1); });
