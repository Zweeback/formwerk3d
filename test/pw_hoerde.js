const { chromium } = require('playwright'); const fs = require('fs');
const PORT = process.env.PORT || 8102, URL = 'http://localhost:' + PORT + '/index.html', SH = process.env.SH || (__dirname + '/../shots/hoerde/');
fs.mkdirSync(SH, { recursive: true });
const shots = JSON.parse(process.env.SHOTS || '[]');
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); const pg = await ctx.newPage(); pg.setDefaultTimeout(240000);
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  const settle = () => pg.waitForFunction(() => window.__v && window.__v.settled(), null, { timeout: 240000, polling: 50 });
  for (const s of shots) {
    await pg.goto(URL + (s.q || '') + (s.cam ? (s.q ? '&' : '?') + 'cam=' + s.cam : '')); await pg.waitForFunction(() => window.__v, null, { timeout: 60000 }); await settle(); await pg.waitForTimeout(s.wait || 400);
    await pg.screenshot({ path: SH + s.name + '.png' }); console.log(s.name, JSON.stringify(await pg.evaluate(() => { const t = window.__v.stats(); return { kacheln: t.resident, MB: +(t.bytes / 1e6).toFixed(1), tris: t.tris }; })));
  }
  console.log('Fehler:', errs.length, errs.slice(0, 3)); await br.close();
})();
