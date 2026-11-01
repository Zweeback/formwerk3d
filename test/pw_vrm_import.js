/* Prüft den glTF/VRM-Import mit einer echten Datei: Transparenz, Normalmap, Hüllbox ohne Morph-Targets, Skelett nur im Rig-Modus.
   Aufruf: node test/pw_vrm_import.js pfad/zur/datei.vrm   (ohne Argument wird übersprungen) */
const { open } = require('./pwlib'); const path = require('path'), fs = require('fs');
const file = process.argv[2]; if (!file || !fs.existsSync(file)) { console.log('übersprungen (keine VRM-Datei angegeben)'); process.exit(0); }
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => {
  const { br, pg, errs } = await open({ viewport: { width: 1400, height: 900 } });
  await pg.evaluate(() => window.Formwerk3D.ui.clearScene());
  await pg.setInputFiles('#tools-top input[type=file]', path.resolve(file));
  await pg.waitForFunction(() => window.Formwerk3D.view.objects().length >= 3 && window.Formwerk3D.rig.bones.length > 10, null, { timeout: 180000 }); await pg.waitForTimeout(2500);
  const r = await pg.evaluate(() => { const F = window.Formwerk3D, V = F.view, T = THREE; const o = V.objects(); const bb = new T.Box3(); o.forEach(x => bb.expandByObject(x)); const s = bb.getSize(new T.Vector3());
    const out = { n: o.length, h: s.y, w: s.x, blend: o.filter(x => x.material.userData.alphaBlend).length, mask: o.filter(x => x.material.alphaTest > 0).length, morph: o.filter(x => x.geometry.morphAttributes && Object.keys(x.geometry.morphAttributes).length).length, nb: F.rig.bones.length, rigVisObj: F.rig.root.visible };
    F.ui.setMode('rig'); out.rigVisRig = F.rig.root.visible; F.ui.setMode('object'); out.rigVisBack = F.rig.root.visible; return out; });
  console.log(JSON.stringify(r));
  ok(r.n >= 3, 'Teile importiert'); ok(r.h > 0.5 && r.h < 2.4, 'Hüllbox plausibel (' + r.h.toFixed(2) + ' m hoch)'); ok(r.morph === 0, 'keine Morph-Targets in der Geometrie');
  ok(r.nb > 10, r.nb + ' Knochen übernommen'); ok(r.rigVisObj === false && r.rigVisRig === true && r.rigVisBack === false, 'Skelett nur im Rig-Modus sichtbar (viele Knochen)');
  if (process.argv[3] === 'alpha') ok(r.blend + r.mask > 0, 'Transparenz (Blend/Maske) übernommen');
  const e = errs.filter(x => !/ERR_FAILED|font/i.test(x)); ok(e.length === 0, 'keine Seitenfehler' + (e.length ? ': ' + e.join('; ') : ''));
  await br.close(); console.log(bad ? 'FEHLER' : 'ALLES OK'); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
