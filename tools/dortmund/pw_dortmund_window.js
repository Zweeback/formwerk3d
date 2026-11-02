require('fs').mkdirSync(__dirname + '/shots', { recursive: true });
const { chromium } = require('playwright'); const fs = require('fs');
const URL = 'http://localhost:8099/index.html';
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const settle = () => pg.waitForFunction(() => window.__v.settled(), null, { timeout: 90000, polling: 50 });
  const res = {};
  // Echtzeit-Bildrate (Software-Rendering, nur Größenordnung) an zwei Stellen
  for (const [nm, cam] of [['strasse', '1280,38,-2980,0.0,-0.12'], ['vogel', '1400,520,-2400,0.5,-0.55']]) {
    await pg.goto(URL + '?cam=' + cam); await pg.waitForFunction(() => window.__v, null, { timeout: 30000 }); await settle();
    const a = await pg.evaluate(() => window.__v.stats().frames); await pg.waitForTimeout(4000); const st = await pg.evaluate(() => window.__v.stats());
    res['bildrate_' + nm] = { fps: +((st.frames - a) / 4).toFixed(1), trisGezeichnet: st.renderedTris, aufrufe: st.calls };
  }
  // Rollendes Fenster: kleiner Radius, Flug quer über die Karte
  const TH = '450,1100,1800,2200';
  await pg.goto(URL + '?th=' + TH + '&cam=400,420,-500,2.6,-0.3'); await pg.waitForFunction(() => window.__v, null, { timeout: 30000 }); await settle();
  const WP = [[400, 420, -500], [1500, 160, -900], [2300, 90, -1900], [1500, 80, -2700], [600, 220, -3600]];
  const pts = []; for (let i = 0; i < WP.length - 1; i++) { const a = WP[i], b = WP[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.round(L / 100); for (let k = 0; k < n; k++) { const u = k / n; pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])), Math.atan2(b[1] - a[1], L) - 0.15]); } }
  const base = await pg.evaluate(() => window.__v.stats()); const rows = []; let prev = base;
  for (const q of pts) { await pg.evaluate(a => window.__v.setCam(...a), q); await settle(); await pg.waitForTimeout(30); const st = await pg.evaluate(() => window.__v.stats()); rows.push({ resident: st.resident, tris: st.tris, bytes: st.bytes - prev.bytes, lv: st.levels.join('/') }); prev = st; }
  const fin = prev;
  res.fenster = { radien: TH, schritte: rows.length, residentMin: Math.min(...rows.map(r => r.resident)), residentMax: Math.max(...rows.map(r => r.resident)), residentTrisMax: Math.max(...rows.map(r => r.tris)), residentTrisMin: Math.min(...rows.map(r => r.tris)), geladen: fin.loads - base.loads, getauscht: fin.swaps - base.swaps, entladen: fin.unloads - base.unloads, bytesGesamt: fin.bytes - base.bytes, bytesMaxSchritt: Math.max(...rows.map(r => r.bytes)) };
  await pg.screenshot({ path: __dirname + '/shots/06_fenster_ende.png' });
  console.log(JSON.stringify(res, null, 1)); console.log('Fehler', errs.length); await br.close();
})().catch(e => { console.error('TESTFEHLER', e); process.exit(1); });
