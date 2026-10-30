const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TH = path.join(__dirname, '../pkg/node_modules/three');
const frag = fs.readFileSync(path.join(__dirname, '../dist/formwerk3d.artifact.min.html'), 'utf8');
const page_html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + frag + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/*', r => { const u = r.request().url(); let f = null; if (/three\.min\.js/.test(u)) f = path.join(TH, 'build/three.min.js'); else { const m = /examples\/js\/(.+)$/.exec(u); if (m) f = path.join(TH, 'examples/js', m[1]); } if (f && fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' }); if (/^(about|data|blob):/.test(u)) return r.continue(); return r.abort(); });
  await pg.setContent(page_html, { waitUntil: 'load' }); await pg.waitForFunction(() => window.Formwerk3D && window.Formwerk3D.view.objects().length >= 3); await pg.waitForTimeout(500);
  const scr = name => pg.evaluate(n => { const F = window.Formwerk3D, V = F.view, o = V.objects().find(x => x.name === n); const v = o.getWorldPosition(new o.position.constructor()).project(V.cam); const r = V.dom.getBoundingClientRect(); return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }; }, name);
  const gear = await scr('Zahnrad'); await pg.mouse.click(gear.x + 42, gear.y + 6); await pg.waitForTimeout(150);
  console.log('Klick aufs Zahnrad wählt:', await pg.evaluate(() => window.Formwerk3D.state.active && window.Formwerk3D.state.active.name));
  const sph = await scr('Skulptur-Kugel'); await pg.mouse.click(sph.x, sph.y); await pg.waitForTimeout(100);
  console.log('Klick auf Kugel wählt:', await pg.evaluate(() => window.Formwerk3D.state.active.name));
  await pg.evaluate(() => window.Formwerk3D.ui.setMode('sculpt')); await pg.waitForTimeout(300);
  const sum = () => pg.evaluate(() => { const a = window.Formwerk3D.view.objects().find(x => x.name === 'Skulptur-Kugel').geometry.attributes.position.array; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * (i % 3 + 1) * (1 + (i % 7)); return s; });
  const s0 = await sum(); await pg.mouse.move(sph.x, sph.y); await pg.mouse.down(); for (let i = 1; i <= 8; i++) await pg.mouse.move(sph.x + i * 4, sph.y + i, { steps: 2 }); await pg.mouse.up(); await pg.waitForTimeout(200);
  const s1 = await sum(); console.log('Sculpt-Strich verformt Netz:', s0 !== s1);
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(150); const s2 = await sum(); console.log('Strg+Z stellt her:', Math.abs(s2 - s0) < 1e-3);
  await pg.evaluate(() => window.Formwerk3D.ui.setMode('object')); await pg.waitForTimeout(200);
  // Orbit: Ziehen im leeren Bereich ändert Kamera
  const c0 = await pg.evaluate(() => window.Formwerk3D.view.cam.position.toArray().join()); await pg.mouse.move(300, 600); await pg.mouse.down(); await pg.mouse.move(420, 560, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(200);
  const c1 = await pg.evaluate(() => window.Formwerk3D.view.cam.position.toArray().join()); console.log('Orbit dreht Kamera:', c0 !== c1);
  // Boolesche Operation per Oberfläche: Export-Modus, Format wählen, Erzeugen
  await pg.evaluate(() => window.Formwerk3D.ui.setMode('code')); await pg.waitForTimeout(300);
  const txt = await pg.evaluate(async () => { const r = await window.Formwerk3D.exp.generate('unreal', { scope: 'all', className: 'AFormwerkModell' }); return r.text.slice(0, 160).replace(/\n/g, ' | '); }); console.log('Unreal:', txt);
  const glb = await pg.evaluate(async () => { const r = await window.Formwerk3D.exp.generate('glb', { scope: 'all' }); return r.text.slice(0, 8) + ' len=' + r.text.length; }); console.log('GLB (base64):', glb);
  console.log('Seitenfehler:', errs.length ? errs.join(' | ') : 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
