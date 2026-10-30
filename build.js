const fs = require('fs'), path = require('path');
let terser; try { terser = require('terser'); } catch (e) { terser = require('./pkg/node_modules/terser'); }
const R = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const mods = fs.readdirSync(path.join(__dirname, 'src')).filter(f => /^\d\d-.*\.js$/.test(f)).sort();
const modsSrc = mods.map(f => '// ---- ' + f + ' ----\n' + R(f)).join('\n');
const loader = R('loader.js'), body = R('body.html'), head = R('head.html');
(async () => {
  const joined = loader.replace('/*MODULES*/', () => modsSrc);
  fs.writeFileSync('dist/modules.js', modsSrc);
  const min = await terser.minify(joined, { compress: { passes: 2, drop_console: false }, mangle: true, format: { comments: false, ascii_only: false } });
  if (min.error) throw min.error;
  const cssMin = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{};:,>])\s*/g, '$1').replace(/;}/g, '}').replace(/\n+/g, '');
  const headMin = head.replace(/<style>([\s\S]*?)<\/style>/, (m, c) => '<style>' + cssMin(c) + '</style>');
  const bodyMin = body.replace(/>\s+</g, '><').trim();
  const page = (h, b, js) => h + '\n' + b + '\n<script>\n' + js + '\n</script>\n';
  // Artefakt-Fassung: ohne Doctype/html/head/body (der Server ergänzt das Gerüst)
  fs.writeFileSync('dist/formwerk3d.artifact.html', page(head, body, joined));
  fs.writeFileSync('dist/formwerk3d.artifact.min.html', page(headMin, bodyMin, min.code));
  const doc = (inner) => '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + inner.replace(/<\/script>\n$/, '</script>\n').replace('<body>', '') + '</head>\n</html>';
  const standalone = (h, b, js) => '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + h + '\n</head>\n<body>\n' + b + '\n<script>\n' + js + '\n</script>\n</body>\n</html>\n';
  fs.writeFileSync('dist/formwerk3d.html', standalone(head, body, joined));
  fs.writeFileSync('dist/formwerk3d.min.html', standalone(headMin, bodyMin, min.code));
  // Offline-Fassung: three.js und Zusatzmodule eingebettet, keine Schriften aus dem Netz
  let TH; try { TH = path.dirname(require.resolve('three/package.json')); } catch (e) { TH = path.join(__dirname, 'pkg/node_modules/three'); }
  if (fs.existsSync(path.join(TH, 'build/three.min.js'))) {
    const inl = f => fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script');
    const addons = [...loader.matchAll(/\['([^']+\.js)', *\d\]/g)].map(m => m[1]);
    const pre = '<script>window.__FW_OFFLINE=1;</script>\n<script>' + inl(path.join(TH, 'build/three.min.js')) + '</script>\n' + addons.map(a => '<script>' + inl(path.join(TH, 'examples/js', a)) + '</script>').join('\n') + '\n';
    const headOff = headMin.replace(/<link[^>]*fonts\.(?:googleapis|gstatic)[^>]*>\s*/g, '');
    fs.writeFileSync('dist/formwerk3d.offline.html', standalone(headOff, bodyMin + '\n' + pre, min.code));
    console.log('formwerk3d.offline.html', (fs.statSync('dist/formwerk3d.offline.html').size / 1024).toFixed(1) + ' KB, ' + addons.length + ' Zusatzmodule');
  } else console.log('three nicht gefunden: Offline-Fassung übersprungen');
  for (const f of ['formwerk3d.html', 'formwerk3d.min.html', 'formwerk3d.artifact.html', 'formwerk3d.artifact.min.html']) console.log(f, (fs.statSync('dist/' + f).size / 1024).toFixed(1) + ' KB');
})();
