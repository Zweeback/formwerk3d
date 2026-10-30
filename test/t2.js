const makeEnv = require('./env.js');
const env = makeEnv(); let F;
try { F = env.boot(); } catch (e) { console.log('BOOT FAIL', e.stack); process.exit(1); }
const w = env.w, T = w.THREE;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
ok(!!F, 'Formwerk gebootet');
ok(F.view.objects().length === 3, 'Startszene hat 3 Objekte: ' + F.view.objects().map(o => o.name).join(', '));
console.log('errs after boot:', env.errs.slice(0, 5));
const vol = g => { const p = g.index ? g.toNonIndexed() : g; const a = p.attributes.position.array; let v = 0; for (let i = 0; i < a.length; i += 9) { v += (a[i] * (a[i + 4] * a[i + 8] - a[i + 5] * a[i + 7]) - a[i + 1] * (a[i + 3] * a[i + 8] - a[i + 5] * a[i + 6]) + a[i + 2] * (a[i + 3] * a[i + 7] - a[i + 4] * a[i + 6])) / 6; } return v; };
const lager = F.view.objects().find(o => o.name === 'Lagerblock');
ok(lager && Math.abs(vol(lager.geometry) - (2.304 - Math.PI * 0.35 * 0.35 * 1.2)) < 0.03, 'Lagerblock Volumen ' + (lager && vol(lager.geometry).toFixed(3)));
module.exports = { env, F, w, T, ok, vol, fails: () => fails };
if (require.main === module) { console.log(fails ? 'FAILS ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0); }
