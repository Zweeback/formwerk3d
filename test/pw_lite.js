// Test der Chat-Fassung (Artefakt-Viewer): lokal ausgeliefert, three.js von der Platte statt von cdnjs
const { chromium } = require('playwright'); const fs = require('fs'); const { spawn } = require('child_process');
const ROOT = __dirname + '/..', SC = ROOT + '/..', PORT = +(process.env.PORT || 8161), SH = ROOT + '/shots/lite/', NORANGE = process.env.NORANGE ? ['--norange'] : [], W = +(process.env.W || 1280), H = +(process.env.H || 720), TOUCH = !!process.env.TOUCH;
fs.mkdirSync(SH, { recursive: true });
(async () => {
  const srv = spawn('python3', [SC + '/lite_src/serve_range.py', String(PORT), process.env.SITE || (SC + '/lite_site'), ...NORANGE], { stdio: 'inherit' }); await new Promise(r => setTimeout(r, 1000));
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await br.newContext({ viewport: { width: W, height: H }, hasTouch: TOUCH, isMobile: TOUCH, deviceScaleFactor: 1 });
  await ctx.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({ path: SC + '/stage/formwerk3d/docs/dortmund/three.min.js', contentType: 'application/javascript' }));
  await ctx.route('**/fonts.googleapis.com/**', r => r.abort());
  const pg = await ctx.newPage(); pg.setDefaultTimeout(280000);
  pg.on('pageerror', e => console.log('PAGEERR', e.message)); pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE.ERR', m.text()); });
  await pg.goto('http://127.0.0.1:' + PORT + '/index.html'); await pg.waitForFunction(() => window.__lite && window.__lite.settled(), null, { timeout: 250000, polling: 300 });
  const st = async n => { await pg.waitForTimeout(800); await pg.waitForFunction(() => window.__lite.settled(), null, { timeout: 250000, polling: 300 }); await pg.waitForTimeout(1200); await pg.screenshot({ path: SH + n + '.png' }); console.log(n, JSON.stringify(await pg.evaluate(() => window.__lite.stats()))); };
  await st('start');
  for (const k of (process.env.PLACES || 'hbf,rein,over').split(',')) { await pg.evaluate(k => window.__lite.go(k, 0), k); await st(k); }
  if (process.env.MENU) { await pg.click('#btn-places'); await pg.waitForTimeout(300); await pg.screenshot({ path: SH + 'menu.png' }); }
  await br.close(); srv.kill();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
