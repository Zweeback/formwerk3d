const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TH = path.join(__dirname, '../pkg/node_modules/three');
const frag = fs.readFileSync(path.join(__dirname, '../dist/formwerk3d.artifact.html'), 'utf8');
const page_html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + frag + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const run = async (name, vp, scheme, actions) => {
    const ctx = await br.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 }); const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 200)); });
    await pg.route('**/*', r => { const u = r.request().url(); let f = null;
      if (/three\.min\.js/.test(u)) f = path.join(TH, 'build/three.min.js'); else { const m = /examples\/js\/(.+)$/.exec(u); if (m) f = path.join(TH, 'examples/js', m[1]); }
      if (f && fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' });
      if (u.startsWith('about:') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); return r.abort(); });
    await pg.setContent(page_html, { waitUntil: 'load' }); await pg.waitForFunction(() => window.Formwerk3D && window.Formwerk3D.view.objects().length >= 3, null, { timeout: 20000 }).catch(e => errs.push('BOOT TIMEOUT'));
    await pg.waitForTimeout(600);
    const info = await pg.evaluate(() => ({ objs: window.Formwerk3D.view.objects().map(o => o.name), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, title: document.title, gl: !!document.querySelector('#vp canvas') }));
    if (actions) await actions(pg, errs);
    await pg.screenshot({ path: path.join(__dirname, '../shots/' + name + '.png') });
    console.log(name, JSON.stringify(info), 'hscroll=' + (info.sw > info.cw), errs.length ? '\n   ' + errs.slice(0, 6).join('\n   ') : 'keine Fehler'); await ctx.close();
  };
  await run('desk-light', { width: 1280, height: 800 }, 'light');
  await run('desk-dark', { width: 1280, height: 800 }, 'dark');
  await run('mobile-light', { width: 400, height: 820 }, 'light');
  await run('mobile-dark', { width: 400, height: 820 }, 'dark');
  const modes = ['cad', 'edit', 'sculpt', 'paint', 'rig', 'map', 'code'];
  for (const m of modes) await run('mode-' + m, { width: 1280, height: 800 }, 'light', async (pg, errs) => {
    await pg.evaluate(() => { const F = window.Formwerk3D; F.view.select(F.view.objects().find(o => o.name === 'Skulptur-Kugel')); });
    if (m === 'rig') await pg.evaluate(() => window.Formwerk3D.demoRig());
    await pg.evaluate(mm => window.Formwerk3D.ui.setMode(mm), m); await pg.waitForTimeout(500); });
  await br.close();
})().catch(e => { console.log('PW-FEHLER', e.stack); process.exit(2); });
