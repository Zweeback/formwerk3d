// Freie Kamera im Viewer (ohne Spiel) mit Foto-Mesh: Straßenhöhe-Ansichten entlang echter Straßen
const { chromium } = require('playwright'); const fs = require('fs'); const { spawn } = require('child_process');
const PORT = 8152, SH = __dirname + '/../shots/meshcam/', MESH = process.env.MESH || 'mg1', CX = +(process.env.CX || 3722), CZ = +(process.env.CZ || -560), HIDE = process.env.HIDE || 'all', EXTRA = process.env.EXTRA || ''; fs.mkdirSync(SH, { recursive: true });
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/../dortmund/viewer10', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); pg.setDefaultTimeout(280000); pg.on('pageerror', e => console.log('PAGEERR', e.message));
  await pg.goto('http://127.0.0.1:' + PORT + '/index.html?mesh=' + MESH + '&mhide=' + HIDE + '&cam=' + CX + ',60,' + CZ + ',0,-0.5' + EXTRA); await pg.waitForFunction(() => window.__v && window.__mesh, null, { timeout: 200000 });
  const settle = async () => { await pg.waitForTimeout(600); await pg.waitForFunction(() => window.__v.settled() && window.__mesh.settled(), null, { timeout: 250000, polling: 200 }); await pg.waitForTimeout(1500); };
  const rd = JSON.parse(fs.readFileSync(__dirname + '/../dortmund/viewer10/tiles/roads.json')); const R = 110, bx = [CX - R, CX + R, CZ - R, CZ + R]; const cands = [];
  for (const e of rd.edges) { const pts = []; for (let i = 0; i < e.p.length; i += 2) if (e.p[i] > bx[0] && e.p[i] < bx[1] && e.p[i + 1] > bx[2] && e.p[i + 1] < bx[3]) pts.push([e.p[i], e.p[i + 1]]); if (pts.length < 3) continue; const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), mid = Math.hypot((a[0] + b[0]) / 2 - CX, (a[1] + b[1]) / 2 - CZ); if (L > 40) cands.push({ sc: L - mid * 0.5 + (e.w || 6) * 2, a, b, w: e.w }); }
  cands.sort((x, y) => y.sc - x.sc); console.log('Straßen', cands.length, JSON.stringify(cands[0]));
  let k = 0;
  for (const c of (process.env.NOROAD ? [] : cands.slice(0, 3))) {
    const A = c.a, B = c.b, L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
    for (const dir of [1, -1]) {
      const s = dir > 0 ? A : B, u = [ux * dir, uz * dir], x = s[0] - u[0] * 8, z = s[1] - u[1] * 8, yaw = Math.atan2(-u[0], -u[1]);
      await pg.evaluate(([x, z, yaw]) => window.__v.setCam(x, 60, z, yaw, -0.5), [x, z, yaw]); await settle();
      const gy = await pg.evaluate(([x, z]) => { const m = window.__mesh, T = window.__v.core.THREE, rc = new T.Raycaster(new T.Vector3(x, 400, z), new T.Vector3(0, -1, 0), 0, 800); const ms = []; m.N.forEach(n => { if (n.mesh) ms.push(n.mesh); }); const h = rc.intersectObjects(ms, false); return h.length ? h[h.length - 1].point.y : null; }, [x, z]);
      if (gy === null) { console.log('kein Boden bei', x, z); continue; }
      await pg.evaluate(([x, y, z, yaw]) => window.__v.setCam(x, y, z, yaw, -0.06), [x, gy + 4.5, z, yaw]); await settle();
      await pg.screenshot({ path: SH + 'cam' + (++k) + '.png' }); console.log('cam' + k, JSON.stringify(await pg.evaluate(() => window.__mesh.stats())), 'Boden', gy.toFixed(1));
    }
  }
  const air = process.env.AIR ? JSON.parse(process.env.AIR) : [['air1', 3900, 140, -300, 0.35, -0.42], ['air2', 3300, 320, -900, 0.9, -0.5], ['air3', 1200, 260, -3200, 0.2, -0.45], ['air4', 4300, 90, -700, -0.9, -0.3]];
  for (const [nm, x, y, z, yaw, pit] of air) { await pg.evaluate(([x, y, z, yaw, pit]) => window.__v.setCam(x, y, z, yaw, pit), [x, y, z, yaw, pit]); await settle(); await pg.screenshot({ path: SH + nm + '.png' }); console.log(nm, JSON.stringify(await pg.evaluate(() => window.__mesh.stats()))); }
  await br.close(); srv.kill();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
