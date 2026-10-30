// F.vox allein testen (ohne DOM)
const fs = require('fs'), path = require('path');
global.THREE = require('../node_modules/three/build/three.cjs');
global.F = {}; global.clamp = (v, a, b) => Math.min(b, Math.max(a, v)); global.DEG = Math.PI / 180;
const load = f => (0, eval)(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8').replace(/^F\.(geo|vox) =/m, 'global.F.$1 ='));
load('20-geo.js'); load('85-vox.js');
function stats(geo) {
  const P = geo.attributes.position.array, I = geo.index.array; let vol = 0; const edges = new Map();
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    for (const [u, v] of [[I[i], I[i + 1]], [I[i + 1], I[i + 2]], [I[i + 2], I[i]]]) { const k = u < v ? u + '_' + v : v + '_' + u; edges.set(k, (edges.get(k) || 0) + 1); }
  }
  let open = 0, nm = 0; edges.forEach(c => { if (c === 1) open++; else if (c > 2) nm++; });
  return { tris: I.length / 3, verts: P.length / 3, vol, open, nm };
}
let t0 = Date.now();
const sph = F.vox.fromField((x, y, z) => Math.hypot(x, y, z) - 1, [-1, -1, -1], [1, 1, 1], 0.05);
let g = F.vox.surface(sph, 0), s = stats(g); console.log('Kugel', s, 'Soll Vol', (4 / 3 * Math.PI).toFixed(3), Date.now() - t0, 'ms');
if (!(s.vol > 4.0 && s.vol < 4.3)) throw new Error('Volumen/Orientierung falsch');
if (s.open || s.nm) throw new Error('nicht wasserdicht');
const tor = F.vox.fromField((x, y, z) => Math.hypot(Math.hypot(x, z) - 1, y) - 0.35, [-1.4, -0.4, -1.4], [1.4, 0.4, 1.4], 0.04);
g = F.vox.surface(tor, 0); s = stats(g); console.log('Torus', s, 'Soll', (2 * Math.PI ** 2 * 1 * 0.35 ** 2).toFixed(3));
if (s.open || s.nm || s.vol < 2) throw new Error('Torus schlecht');
// Normalen zeigen nach aussen
const n = g.attributes.normal.array, p = g.attributes.position.array; let bad = 0;
for (let i = 0; i < p.length; i += 3) { const r = Math.hypot(p[i], p[i + 2]), cx = p[i] / r, cz = p[i + 2] / r, ox = p[i] - cx, oy = p[i + 1], oz = p[i + 2] - cz; if (ox * n[i] + oy * n[i + 1] + oz * n[i + 2] < 0) bad++; }
console.log('Normalen falsch:', bad); if (bad > 0) throw new Error('Normalen innen');
// Dichte aus Punkten
const pts = []; for (let i = 0; i < 20000; i++) { const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = Math.sqrt(1 - u * u); pts.push(r * Math.cos(th), u, r * Math.sin(th)); }
const dg = F.vox.grid([-1, -1, -1], [1, 1, 1], 0.06, 3); F.vox.splatPoints(dg, new Float32Array(pts), null, 1.2); F.vox.blur(dg, 1);
for (let i = 0; i < dg.d.length; i++) dg.d[i] = -dg.d[i]; // innen = hohe Dichte
let mx = 0; for (const v of dg.d) mx = Math.min(mx, v);
g = F.vox.surface(dg, mx * 0.35); s = stats(g); console.log('Punkte→Netz', s);
console.log('OK');
