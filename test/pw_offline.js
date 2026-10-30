const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } }); const blocked = [];
  await ctx.route(/^https?:/, r => { blocked.push(r.request().url()); r.abort(); });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(__dirname, '../dist/formwerk3d.offline.html')); await pg.waitForFunction(() => window.Formwerk3D && window.Formwerk3D.view, null, { timeout: 30000 });
  const R = await pg.evaluate(() => { const F = window.Formwerk3D; F.run('[{"clear":true},{"add":"gear","teeth":14,"pos":[0,0.5,0]},{"edit":"Zahnrad","select":{"normal":[0,0,1],"tol":10},"op":"inset","amount":0.05},{"view":"iso"}]'); return { objs: F.view.objects().map(o => o.name), status: document.querySelector('#status-msg').textContent, three: THREE.REVISION, fflate: typeof window.fflate, loadingHidden: document.getElementById('loading').hidden }; });
  console.log(JSON.stringify(R)); console.log('blockierte Netzanfragen:', JSON.stringify(blocked)); console.log('Seitenfehler:', errs.join(' | ') || 'keine');
  await pg.waitForTimeout(400); await pg.screenshot({ path: path.join(__dirname, '../shots/offline.png') }); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
