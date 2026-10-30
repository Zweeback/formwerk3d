// Rettungswagen: Karosserie ohne DOM erzeugen, Dreiecke zählen, Silhouetten als PNG
const fs = require('fs'), path = require('path');
global.THREE = require('../pkg/node_modules/three/build/three.cjs');
global.F = {}; global.clamp = (v, a, b) => Math.min(b, Math.max(a, v)); global.DEG = Math.PI / 180; global.smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const load = f => (0, eval)(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8').replace(/^F\.(geo|vox|vehicle) =/m, 'global.F.$1 ='));
load('20-geo.js'); load('85-vox.js'); load('87-vehicle.js');
const h = parseFloat(process.argv[2] || '0.04');
let t0 = Date.now(); const body = F.vehicle.bodyGeometry(h); console.log('Karosserie', body.attributes.position.count / 3, 'Dreiecke', Date.now() - t0, 'ms', 'h=', h);
t0 = Date.now(); const tire = F.vehicle.tireGeometry(), rim = F.vehicle.rimGeometry(); console.log('Reifen', tire.index.count / 3, 'Felge', rim.attributes.position.count / 3, Date.now() - t0, 'ms');
const tris = body.attributes.position.count / 3 + 4 * (tire.index.count / 3 + rim.attributes.position.count / 3); console.log('Summe (ohne Kleinteile)', tris);
// Schnitt-Silhouette: Seitenansicht aus dem Feld
const fn = F.vehicle.field(), W = 150, H = 60, rows = [];
for (let j = 0; j < H; j++) { let r = ''; const y = 2.9 - j * 0.05; for (let i = 0; i < W; i++) { const z = 2.8 - i * 0.04; r += fn(0.0, y, z) < 0 ? '#' : fn(0.9, y, z) < 0 ? '+' : '.'; } rows.push(r); }
console.log(rows.join('\n'));
