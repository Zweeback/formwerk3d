const { open } = require('./pwlib'); const path = require('path');
(async () => {
  const { br, pg, errs } = await open();
  const R = await pg.evaluate(async () => {
    const F = window.Formwerk3D, V = F.view, out = {}, tri = n => F.geo.stats(V.objects().find(o => o.name === n).geometry).tris;
    // 1) KI-Befehle
    F.run('[{"clear":true},{"add":"box","w":2,"h":1,"d":2,"name":"Block"},{"edit":"Block","select":{"normal":[0,1,0]},"op":"inset","amount":0.3},{"edit":"Block","select":{"normal":[0,1,0],"axis":"y","min":0.9,"rel":true,"box":[[0.2,0,0.2],[0.8,1,0.8]],"rel":true},"op":"extrude","amount":-0.2},{"view":"iso"}]');
    out.cmd1 = { tris: tri('Block'), status: document.querySelector('#status-msg').textContent };
    F.run('[{"edit":"Block","op":"loopcut","axis":"x","count":3},{"edit":"Block","select":{"axis":"y","min":0.95,"rel":true},"op":"move","by":[0,0.3,0],"soft":0.8}]');
    out.cmd2 = { tris: tri('Block'), status: document.querySelector('#status-msg').textContent };
    F.run('[{"edit":"Block","select":{"normal":[1,0,0]},"op":"separate","name":"Seite"}]');
    out.sep = V.objects().map(o => o.name + ':' + F.geo.stats(o.geometry).tris);
    // 2) Undo
    const n0 = V.objects().length; F.history.back(); out.undoSep = [n0, V.objects().length];
    F.history.fwd && F.history.fwd();
    // 3) Oberfläche: Mesh-Modus, Punkte wählen, Extrudieren
    F.run('[{"clear":true},{"add":"box","w":2,"h":1,"d":2,"name":"Kiste"}]');
    const ob = V.objects().find(o => o.name === 'Kiste'); V.select(ob); F.ui.setMode('edit');
    const E = F.edit; E.xray = true;
    // oberste Punkte wählen
    const pos = ob.geometry.attributes.position; E.sel.clear(); E.groups.forEach((g, i) => { if (pos.getY(g.idx[0]) > 0.4) E.sel.add(i); }); E.colorPts();
    out.selBefore = E.sel.size;
    F.ui.meshop({ op: 'extrude', amount: 0.4 }, 'Extrudieren');
    out.afterExtrude = { tris: F.geo.stats(ob.geometry).tris, sel: E.sel.size, status: document.querySelector('#status-msg').textContent };
    F.ui.meshop({ op: 'loopcut', axis: 'y', count: 2 }, 'Kantenschleife');
    out.afterLoop = { tris: F.geo.stats(ob.geometry).tris, status: document.querySelector('#status-msg').textContent };
    out.panelHasSection = !!Array.from(document.querySelectorAll('#panel h3, .sec h3')).find(h => h.textContent === 'Flächen bearbeiten');
    return out; });
  console.log(JSON.stringify(R, null, 1));
  await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(__dirname, '../shots/meshops.png') });
  console.log('Fehler:', errs.filter(e => !/ERR_FAILED|font/i.test(e)).join('\n  ') || 'keine'); await br.close();
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
