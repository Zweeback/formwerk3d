require('fs').mkdirSync(__dirname + '/shots', { recursive: true });
const { chromium } = require('playwright'); const fs = require('fs');
const URL = 'http://localhost:8099/index.html', SH = __dirname + '/shots/';
const W = 1280, Hh = 720;
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await br.newContext({ viewport: { width: W, height: Hh }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const settle = async (to) => { const t = Date.now(); await pg.waitForFunction(() => window.__v && window.__v.settled(), null, { timeout: to || 90000, polling: 50 }); return Date.now() - t; };
  const frameMs = async () => pg.evaluate(() => new Promise(r => { let n = 0, t0 = performance.now(); const f = () => { if (++n >= 4) r((performance.now() - t0) / 4); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  const out = {};
  // 1) Kaltstart
  const t0 = Date.now(); await pg.goto(URL + '?cam=1500,260,-2400,0.3,-0.4'); await pg.waitForFunction(() => window.__v && window.__v.stats().firstFrameMs !== null, null, { timeout: 90000, polling: 20 });
  const tFirst = Date.now() - t0; let s = await pg.evaluate(() => window.__v.stats());
  out.cold = { zeitBisErstesBildMs: tFirst, imPageErstesBildMs: Math.round(s.firstFrameMs), bytesBeiErstemBild: s.bytes, dateienBeiErstemBild: s.fetches, kachelnBeiErstemBild: s.resident };
  const ts = await settle(); s = await pg.evaluate(() => window.__v.stats());
  out.start = { zeitBisAllesGeladenMs: Date.now() - t0, ...s, frameMsGemessen: Math.round(await frameMs()) };
  await pg.screenshot({ path: SH + '01_start.png' });
  // 2) Debug-Ansicht der Stufen von weit oben
  await pg.goto(URL + '?debug=1&cam=1500,700,-300,0.0,-0.45'); await pg.waitForFunction(() => window.__v, null, { timeout: 30000 }); await settle(); await pg.waitForTimeout(300);
  await pg.screenshot({ path: SH + '02_stufen_debug.png' });
  out.debugOben = await pg.evaluate(() => window.__v.stats());
  // 3) Straßenhöhe im dichten Viertel
  await pg.goto(URL + '?cam=1280,38,-2980,0.0,-0.12'); await pg.waitForFunction(() => window.__v, null, { timeout: 30000 }); await settle(); await pg.waitForTimeout(300);
  await pg.screenshot({ path: SH + '03_strasse.png' }); out.strasse = await pg.evaluate(() => window.__v.stats());
  await pg.evaluate(() => window.__v.setCam(1400, 520, -2400, 0.5, -0.55)); await settle(); await pg.waitForTimeout(300);
  await pg.screenshot({ path: SH + '04_vogel.png'});
  // Nahaufnahme L0 vs L1 (gleiche Stelle, Schwellen erzwungen)
  for (const [nm, th] of [['L0', '4000,4000,4000,5000'], ['L1', '1,4000,4000,5000'], ['L2', '1,1,4000,5000']]) {
    await pg.goto(URL + '?th=' + th + '&cam=1280,150,-3000,0.0,-0.5'); await pg.waitForFunction(() => window.__v, null, { timeout: 30000 }); await settle(); await pg.waitForTimeout(300);
    await pg.screenshot({ path: SH + '05_vergleich_' + nm + '.png', clip: { x: 160, y: 60, width: 960, height: 600 } });
    const st = await pg.evaluate(() => window.__v.stats()); out['vergleich_' + nm] = { renderedTris: st.renderedTris, bytes: st.bytes, levels: st.levels };
  }
  // 4) Flug: 4 km Schnitt, Schritte à 100 m, Teleport + Warten bis geladen
  await pg.goto(URL + '?cam=400,420,-500,2.6,-0.3'); await pg.waitForFunction(() => window.__v, null, { timeout: 30000 }); await settle();
  const WP = [[400, 420, -500], [1500, 160, -900], [2300, 90, -1900], [1500, 80, -2700], [600, 220, -3600]];
  const pts = []; for (let i = 0; i < WP.length - 1; i++) { const a = WP[i], b = WP[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.round(L / 100); for (let k = 0; k < n; k++) { const u = k / n; pts.push({ p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], yaw: Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])), pitch: Math.atan2(b[1] - a[1], L) - 0.15 }); } }
  const rows = []; let prev = await pg.evaluate(() => window.__v.stats()); const base = prev;
  for (const q of pts) {
    const t = Date.now(); await pg.evaluate(a => window.__v.setCam(...a), [...q.p, q.yaw, q.pitch]); await settle(); const ms = Date.now() - t; await pg.waitForTimeout(40);
    const st = await pg.evaluate(() => window.__v.stats());
    rows.push({ x: Math.round(q.p[0]), z: Math.round(q.p[2]), msBisGeladen: ms, neueBytes: st.bytes - prev.bytes, neueDateien: st.fetches - prev.fetches, tris: st.renderedTris, resident: st.resident, residentTris: st.tris, levels: st.levels.join('/'), heap: st.heapMB && Math.round(st.heapMB) }); prev = st;
  }
  const fin = await pg.evaluate(() => window.__v.stats());
  out.flug = { schritte: rows.length, strecke_m: rows.length * 100, gesamtBytes: fin.bytes - base.bytes, geladen: fin.loads - base.loads, getauscht: fin.swaps - base.swaps, entladen: fin.unloads - base.unloads,
    msBisGeladen: { median: [...rows].map(r => r.msBisGeladen).sort((a, b) => a - b)[Math.floor(rows.length / 2)], max: Math.max(...rows.map(r => r.msBisGeladen)) },
    trisMax: Math.max(...rows.map(r => r.tris)), residentMax: Math.max(...rows.map(r => r.resident)), residentTrisMax: Math.max(...rows.map(r => r.residentTris)), neueBytesMaxSchritt: Math.max(...rows.map(r => r.neueBytes)), heapMax: Math.max(...rows.map(r => r.heap || 0)) };
  fs.writeFileSync(__dirname + '/shots/messung.json', JSON.stringify({ out, rows, errs }, null, 1));
  console.log(JSON.stringify(out, null, 1)); console.log('Fehler:', errs.length, errs.slice(0, 5));
  await br.close();
})().catch(e => { console.error('TESTFEHLER', e); process.exit(1); });
