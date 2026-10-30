const { open } = require('./pwlib'); const path = require('path');
(async () => {
  const { br, pg, errs } = await open();
  const R = await pg.evaluate(async () => {
    const F = window.Formwerk3D, out = {}, V = F.view, tri = n => F.geo.stats(V.objects().find(o => o.name === n).geometry).tris;
    F.run('[{"clear":true},{"add":"box","w":2,"h":1,"d":1,"name":"Sockel"},{"add":"icosphere","r":0.8,"detail":4,"pos":[3,0.8,0],"name":"Kugel"},{"mirror":"Sockel","axis":"x"},{"array":"Sockel","count":3,"offset":[0,0,1.5]},{"subdivide":"Kugel","kind":"loop"},{"decimate":"Kugel","ratio":0.3},{"deform":"Sockel","kind":"twist","amount":20},{"shell":"Kugel","thickness":0.03},{"view":"iso"}]');
    out.cmd = { objs: V.objects().map(o => o.name + ':' + F.geo.stats(o.geometry).tris), status: document.querySelector('#status-msg').textContent };
    F.run('[{"merge":["Sockel","Kugel"],"name":"Gruppe"}]'); out.merge = V.objects().map(o => o.name);
    out.manualLen = F.manual().length; out.promptHasPhoto = /"photo"/.test(F.llmPrompt());
    out.shot = F.api.screenshot().length > 5000;
    F.snapshotView(); out.snapImg = !!document.querySelector('#help img'); F.ui.help(false);
    for (const m of ['cad', 'map', 'photo', 'code', 'paint', 'rig', 'object']) { F.ui.setMode(m); if (F.state.mode !== m) out['modeFail_' + m] = F.state.mode; }
    return out; });
  console.log(JSON.stringify(R, null, 1));
  // Scanner-Demo
  const t0 = Date.now();
  const D = await pg.evaluate(async () => { const F = window.Formwerk3D; const m = await F.demoScan(); return { objs: F.view.objects().length, status: document.querySelector('#status-msg').textContent, tris: F.geo.stats(m.geometry).tris, x: m.position.x }; });
  console.log('Scan-Demo', (Date.now() - t0) + ' ms', JSON.stringify(D));
  await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(__dirname, '../shots/scan-demo.png') });
  console.log('Fehler:', errs.length ? errs.join('\n  ') : 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
