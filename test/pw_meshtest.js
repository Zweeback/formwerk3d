const { chromium } = require('playwright'); const fs = require('fs'); const { spawn } = require('child_process');
const dirs = (process.env.DIRS || 'ml_a').split(','), SH = __dirname + '/../shots/mesh/', PORT = 8140;
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/../meshview', stdio: 'ignore' });
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] }); await new Promise(r => setTimeout(r, 1500));
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); pg.setDefaultTimeout(300000); pg.on('pageerror', e => { console.log('PAGEERR', e.message); process.exit(2); }); pg.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
  const cx = +(process.env.CX || 3898), cz = +(process.env.CZ || -596);
  for (const d of dirs) {
    await pg.goto('http://127.0.0.1:' + PORT + '/index.html?dir=' + d + '&flip=' + (process.env.FLIP || '0')); await pg.waitForFunction(() => window.__ready, null, { timeout: 200000 }); await pg.waitForTimeout(500);
    const st = await pg.evaluate(() => window.__stat); console.log(d, JSON.stringify(st));
    const y0 = await pg.evaluate(([cx, cz]) => 0, [cx, cz]);
    // a) Draufsicht
    await pg.evaluate(([cx, cz, h]) => window.__cam(cx, h, cz + 0.1, cx, 0, cz, 50), [cx, cz, +(process.env.TOPH || 330)]); await pg.screenshot({ path: SH + d + '_top.png' });
    // Straßenaugenhöhe: Boden am Standort per Strahl, dann Kamera 5 m darüber
    const gy = async (x, z) => { const h = await pg.evaluate(([x, z]) => window.__ground(x, z), [x, z]); return h ? h[h.length - 1] : 0; };
    // Kameras auf der echten Straße: Kante des Straßennetzes mit den meisten Punkten im Teststück
    const rd = JSON.parse(fs.readFileSync(__dirname + '/../dortmund/viewer10/tiles/roads.json')); const bx = [cx - 130, cx + 130, cz - 130, cz + 130]; let best = null;
    for (const e of rd.edges) { const pts = []; for (let i = 0; i < e.p.length; i += 2) if (e.p[i] > bx[0] && e.p[i] < bx[1] && e.p[i + 1] > bx[2] && e.p[i + 1] < bx[3]) pts.push([e.p[i], e.p[i + 1]]); if (pts.length < 3) continue; const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), mid = Math.hypot((a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cz); const sc = L - mid * 0.5 + (e.w || 6) * 2; if (L > 40 && (!best || sc > best.sc)) best = { sc, n: pts.length, w: e.w, a, b }; }
    console.log('Straße', JSON.stringify(best)); const A = best.a, B = best.b, L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
    const at = (t) => [A[0] + ux * t, A[1] + uz * t];
    const shots = [['street', at(-10), at(60), 4.5, 2.5, 66], ['street2', at(20), at(-60), 5.5, 3, 66], ['lot', at(40), [at(40)[0] - uz * 60, at(40)[1] + ux * 60], 3.5, 2, 70], ['high', at(-20), at(80), 28, 4, 60]];
    for (const [nm, c, t, hc, ht, fov] of shots) { const y0 = await gy(c[0], c[1]), y1 = await gy(t[0], t[1]); await pg.evaluate(([c, t, a, b, fov]) => window.__cam(c[0], a, c[1], t[0], b, t[1], fov), [c, t, y0 + hc, y1 + ht, fov]); await pg.screenshot({ path: SH + d + '_' + nm + '.png' }); console.log(d, nm, 'Bodenhöhe', y0, y1); }
  }
  await br.close(); srv.kill();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
