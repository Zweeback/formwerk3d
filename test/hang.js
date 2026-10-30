const { env, F, w } = require('./t2.js');
const sph = F.view.objects().find(o => o.name === 'Skulptur-Kugel'); F.view.select(sph);
const counts = {};
function wrap(obj, label) { for (const k of Object.keys(obj)) { const f = obj[k]; if (typeof f !== 'function' || /^(cur|layer|doc)$/.test(k)) continue; obj[k] = function () { const key = label + '.' + k; counts[key] = (counts[key] || 0) + 1; if (counts[key] <= 3) console.log('>', key); if (counts[key] > 5000) { console.log('LOOP in', key); process.exit(3); } return f.apply(this, arguments); }; } }
wrap(F.paint, 'paint'); wrap(F.paintEditor, 'editor'); wrap(F.pane, 'pane');
console.log('vor paint'); F.ui.setMode('paint'); console.log('nach paint');
process.exit(0);
