const { open } = require('./pwlib'); const path = require('path');
(async () => {
  const { br, pg, errs } = await open();
  const R = await pg.evaluate(async () => {
    const F = window.Formwerk3D, V = F.view, out = {}, st = () => document.querySelector('#status-msg').textContent;
    const err = fn => { try { fn(); return null; } catch (e) { return e.message; } };
    // Sculpt
    F.run('[{"clear":true},{"add":"icosphere","r":1,"detail":4,"pos":[0,1,0],"name":"Kugel"}]');
    const k = V.objects()[0]; const top0 = Math.max(...Array.from(k.geometry.attributes.position.array).filter((_, i) => i % 3 === 1));
    F.run('[{"sculpt":"Kugel","brush":"inflate","top":[0,0],"radius":0.5,"strength":0.8,"repeat":4}]');
    const k2 = V.objects()[0], top1 = Math.max(...Array.from(k2.geometry.attributes.position.array).filter((_, i) => i % 3 === 1));
    out.sculpt = { top0: +top0.toFixed(3), top1: +top1.toFixed(3), status: st() };
    F.history.back(); const top2 = Math.max(...Array.from(V.objects()[0].geometry.attributes.position.array).filter((_, i) => i % 3 === 1)); out.sculptUndo = +top2.toFixed(3);
    // Fehlerfall
    out.sculptErr = err(() => F.cmd([{ sculpt: 'Kugel', brush: 'x' }]));
    // Paint
    F.run('[{"clear":true},{"add":"box","w":2,"h":1,"d":1,"name":"Wand","pos":[0,0.5,0]},{"paint":"Wand","generate":{"name":"bricks","a":10,"color":"#8a3b2a","color2":"#d9d2c3"},"text":{"text":"RTW","x":512,"y":300,"size":160,"color":"#ffffff"},"shapes":[{"rect":[0,0,1024,80],"color":"#1f4fa8"}]}]');
    const w = V.objects()[0], map = w.material.map; out.paint = { hasMap: !!map, status: st() };
    if (map && map.image) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.drawImage(map.image, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data; let blue = 0, red = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 2] > 120 && d[i] < 60) blue++; if (d[i] > 100 && d[i + 1] < 90) red++; } out.paint.blueBand = blue; out.paint.redBricks = red; }
    out.paintErr = err(() => F.cmd([{ paint: 'Wand', generate: 'nix' }]));
    // Rig
    F.run('[{"clear":true},{"add":"cylinder","rt":0.15,"rb":0.15,"h":1.4,"pos":[0,0.7,0],"seg":16,"name":"Arm"},{"subdivide":"Arm","kind":"flat"},{"rig":{"bones":[{"name":"A","pos":[0,0,0]},{"name":"B","pos":[0,0.7,0],"parent":"A"},{"name":"C","pos":[0,1.4,0],"parent":"B"}]}},{"rig":{"bind":"Arm"}}]');
    out.rigBound = { skinned: V.objects().filter(o => o.isSkinnedMesh).length, status: st(), bones: F.rig.bones.map(b => b.name) };
    F.run('[{"rig":{"keys":[{"t":0,"pose":{"B":[0,0,0]}},{"t":1,"pose":{"B":[0,0,60]}}],"duration":1,"loop":true}}]');
    out.rigKeys = { n: F.rig.keys.length, status: st() };
    F.rig.seek(0.5); const b = F.rig.bones.find(x => x.name === 'B'); out.rigMid = +(new THREE.Euler().setFromQuaternion(b.quaternion).z * 180 / Math.PI).toFixed(1);
    out.rigErr = err(() => F.cmd([{ rig: { pose: { Nix: [0, 0, 0] } } }]));
    F.run('[{"mode":"rig"},{"view":"front"}]'); F.rig.seek(1);
    out.preset = (() => { F.run('[{"rig":{"clear":true,"preset":"humanoid"}}]'); return F.rig.bones.length; })();
    return out; });
  console.log(JSON.stringify(R, null, 1));
  await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(__dirname, '../shots/ai2.png') });
  console.log('Fehler:', errs.filter(e => !/ERR_FAILED|font/i.test(e)).join('\n  ') || 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
