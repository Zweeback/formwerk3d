const { open } = require('./pwlib'); const path = require('path'), fs = require('fs');
(async () => {
  const which = process.argv[2] || 'LOD1'; const f = path.join(__dirname, '../dortmund/glb/Dortmund_48Zellen_' + (which === 'LOD1' ? 'LOD1' : 'bereinigt') + '.glb');
  const { br, pg, errs } = await open({ viewport: { width: 1280, height: 800 } });
  const n0 = await pg.evaluate(() => window.Formwerk3D.view.objects().length); const t0 = Date.now();
  await pg.setInputFiles('#tools-top input[type=file]', f);
  try { await pg.waitForFunction(n => window.Formwerk3D.view.objects().length > n, n0, { timeout: 240000, polling: 200 }); } catch (e) { console.log('Import kam nicht an:', e.message.slice(0, 100)); }
  const ms = Date.now() - t0; await pg.waitForTimeout(2500);
  const info = await pg.evaluate(() => { const o = window.Formwerk3D.view.objects(); let tris = 0, verts = 0; o.forEach(x => { const g = x.geometry; if (g) { tris += (g.index ? g.index.count : g.attributes.position.count) / 3; verts += g.attributes.position.count; } }); const last = o[o.length - 1]; return { n: o.length, tris, verts, name: last && last.name, hasColor: !!(last && last.geometry && last.geometry.attributes.color) }; });
  console.log(which, 'Import:', ms, 'ms', JSON.stringify(info)); console.log('Fehler/Warnungen:', errs.length, errs.slice(0, 4));
  await pg.evaluate(() => { const o = window.Formwerk3D.view.objects(); o.slice(0, o.length - 1).forEach(x => { x.visible = false; }); });
  await pg.click('text=Iso'); await pg.click('text=Alles zeigen'); await pg.waitForTimeout(3500);
  await pg.screenshot({ path: path.join(__dirname, '../shots/dortmund/07_formwerk_' + which + '.png'), clip: { x: 220, y: 70, width: 740, height: 700 } }); await br.close();
})().catch(e => { console.error('TESTFEHLER', e.message); process.exit(1); });
