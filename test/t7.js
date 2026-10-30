// Mesh-Operationen: reiner Node-Test
const fs = require('fs'), path = require('path');
const THREE = require(path.join(__dirname, '../node_modules/three/build/three.cjs'));
const F = {}; new Function('F', 'THREE', fs.readFileSync(path.join(__dirname, '../src/41-meshops.js'), 'utf8'))(F, THREE);
const M = F.meshops; let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
// Wasserdicht-Prüfung: jede gerichtete Kante kommt genau einmal vor, ihre Gegenkante genau einmal
function closed(geo) { const T = M.topo(geo), c = new Map(); for (let t = 0; t < T.n; t++) for (let k = 0; k < 3; k++) { const a = T.cg[t * 3 + k], b = T.cg[t * 3 + (k + 1) % 3], e = a + '>' + b; c.set(e, (c.get(e) || 0) + 1); } let open = 0, dup = 0; c.forEach((v, e) => { const [a, b] = e.split('>'); if (v > 1) dup++; if (!c.has(b + '>' + a)) open++; }); return { open, dup, tris: T.n }; }
function volume(geo) { const T = M.topo(geo); let v = 0; for (let t = 0; t < T.n; t++) { const o = t * 9, P = T.P; v += (P[o] * (P[o + 4] * P[o + 8] - P[o + 5] * P[o + 7]) - P[o + 1] * (P[o + 3] * P[o + 8] - P[o + 5] * P[o + 6]) + P[o + 2] * (P[o + 3] * P[o + 7] - P[o + 4] * P[o + 6])) / 6; } return v; }
const box = new THREE.BoxGeometry(2, 1, 2, 1, 1, 1);
let T = M.topo(box); ok(T.n === 12 && T.ng === 8, 'Box: 12 Dreiecke, 8 Punkte');
let top = M.select(T, { normal: [0, 1, 0], tol: 10 }); ok(M.count(top) === 2, 'Oberseite = 2 Dreiecke (' + M.count(top) + ')');
let r = M.extrude(T, top, 0.5); let cl = closed(r.geo); ok(cl.open === 0 && cl.dup === 0, 'Extrusion wasserdicht (offen ' + cl.open + ', doppelt ' + cl.dup + ', ' + cl.tris + ' Dreiecke)');
ok(Math.abs(volume(r.geo) - (4 + 2)) < 1e-4, 'Volumen 4 -> 6 (' + volume(r.geo).toFixed(4) + ')');
r = M.inset(T, top, 0.3, 0); cl = closed(r.geo); ok(cl.open === 0 && cl.dup === 0 && Math.abs(volume(r.geo) - 4) < 1e-4, 'Inset wasserdicht, Volumen gleich (' + volume(r.geo).toFixed(3) + ', offen ' + cl.open + ')');
{ const T2 = M.topo(r.geo), m2 = M.facesFromKeys(T2, r.keys, false), r2 = M.extrude(T2, m2, -0.3); const c2 = closed(r2.geo); ok(c2.open === 0 && c2.dup === 0 && Math.abs(volume(r2.geo) - (4 - 1.96 * 0.3)) < 1e-3, 'Tasche (Inset + Eindrücken): Volumen ' + volume(r2.geo).toFixed(3) + ', offen ' + c2.open + ', doppelt ' + c2.dup); }
r = M.fase(T, top, 0.2); cl = closed(r.geo); const vf = volume(r.geo); ok(cl.open === 0 && cl.dup === 0 && vf < 4 && vf > 3.7, 'Fase wasserdicht, Volumen kleiner (' + vf.toFixed(4) + ', offen ' + cl.open + ')');
r = M.loopcut(T, 'y', { count: 2 }); cl = closed(r.geo); ok(cl.open === 0 && Math.abs(volume(r.geo) - 4) < 1e-4 && cl.tris > 12, 'Kantenschleife: ' + cl.tris + ' Dreiecke, offen ' + cl.open);
r = M.loopcut(T, 'x', { at: 0.3 }); cl = closed(r.geo); ok(cl.open === 0 && Math.abs(volume(r.geo) - 4) < 1e-4, 'Schnitt bei x=0.3 wasserdicht');
r = M.separate(T, top); ok(r.geo.attributes.position.count === 30 && r.part.attributes.position.count === 6, 'Abtrennen 10 + 2 Dreiecke');
r = M.remove(T, top); ok(r.geo.attributes.position.count === 30, 'Löschen');
// Verschmelzen: Oberseite in die Mitte
const ks = new Set(); for (let t = 0; t < T.n; t++) if (top[t]) for (let k = 0; k < 3; k++) ks.add(T.keys[T.cg[t * 3 + k]]);
r = M.merge(T, ks, 0); ok(r.geo.attributes.position.count / 3 === 6 && /entfallen/.test(r.info), 'Verschmelzen -> Pyramide (' + r.geo.attributes.position.count / 3 + ' Dreiecke, ' + r.info + ')');
r = M.transform(T, top, { move: [0, 0.5, 0] }); ok(Math.abs(volume(r.geo) - 4 - 2 * 1 * 0) >= 0 && r.keys.size === 4, 'Verschieben der Oberseite (' + r.keys.size + ' Punkte)');
// run() mit Befehl
r = M.run(box, { select: { axis: 'y', min: 0.9, max: 1, rel: true }, op: 'extrude', amount: 0.3 }); cl = closed(r.geo); ok(cl.open === 0, 'run(): relative Auswahl + extrude');
// Kugel + Normalen
const sph = new THREE.SphereGeometry(1, 24, 16); let TS = M.topo(sph); let ms = M.select(TS, { axis: 'y', min: 0.8, rel: true });
r = M.extrude(TS, ms, 0.2); ok(r.geo.attributes.normal.count === r.geo.attributes.position.count && isFinite(r.geo.attributes.normal.array[0]), 'Kugelkappe extrudiert, Normalen endlich');
let nn = 0; for (const v of r.geo.attributes.normal.array) if (!isFinite(v)) nn++; ok(nn === 0, 'keine NaN in Normalen');
console.log(bad ? bad + ' Fehler' : 'alles ok'); process.exit(bad ? 1 : 0);
