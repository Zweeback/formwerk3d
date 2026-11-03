// Fahrmodus mit Foto-Mesh: Start, Fahrt, Vergleich mit altem Gelände
const { chromium } = require('playwright'); const fs = require('fs'); const { spawn } = require('child_process');
const PORT = 8150, SH = __dirname + '/../shots/meshgame/', MESH = process.env.MESH || 'mg1', MODES = (process.env.MODES || 'all,cover').split(','); fs.mkdirSync(SH, { recursive: true });
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/../dortmund/viewer10', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage(); pg.setDefaultTimeout(280000);
  pg.on('pageerror', e => console.log('PAGEERR', e.message)); pg.on('console', m => { const t = m.text(); if (m.type() === 'error' || /Foto-Mesh/.test(t)) console.log('CONSOLE', t.slice(0, 200)); });
  for (const mode of MODES) {
    await pg.goto('http://127.0.0.1:' + PORT + '/index.html?game=1&mode=driver&t=14.5&mesh=' + MESH + '&mhide=' + mode); await pg.waitForFunction(() => window.__game && window.__mesh, null, { timeout: 200000 });
    const settle = async () => { await pg.waitForFunction(() => window.__v.settled() && window.__mesh.settled(), null, { timeout: 200000, polling: 200 }); await pg.waitForTimeout(1200); };
    await settle(); await pg.screenshot({ path: SH + mode + '_1_start.png' }); console.log(mode, 'start', JSON.stringify(await pg.evaluate(() => window.__mesh.stats())));
    const p0 = await pg.evaluate(() => { const g = window.__game; return g.state ? g.state() : null; }); console.log('Start', JSON.stringify(p0).slice(0, 200));
    await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 * 4; i++) g.step(1 / 60, { up: 1, down: 0, left: 0, right: 0, hand: 0 }); });
    await settle(); await pg.screenshot({ path: SH + mode + '_2_fahrt.png' }); console.log(mode, 'fahrt', JSON.stringify(await pg.evaluate(() => ({ m: window.__mesh.stats(), s: window.__game.state && window.__game.state() }))).slice(0, 400));
  }
  await br.close(); srv.kill();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
