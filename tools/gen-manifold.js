/* Erzeugt src/12-manifold.js: manifold-3d (Apache-2.0) mit eingebettetem WASM, damit die Seite ohne Netz und ohne fetch auskommt.
   Aufruf: node tools/gen-manifold.js   (benötigt pkg/node_modules/manifold-3d) */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../pkg/node_modules/manifold-3d');
const ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
let js = fs.readFileSync(path.join(dir, 'manifold.js'), 'utf8');
js = js.replace(/import\.meta\.url/g, '""').replace(/export default Module;\s*$/, '');
const b64 = fs.readFileSync(path.join(dir, 'manifold.wasm')).toString('base64');
const out = `/* ============================================================
   GENERIERT von tools/gen-manifold.js – nicht von Hand bearbeiten.
   manifold-3d ${ver} (Apache-2.0, https://github.com/elalish/manifold), WASM eingebettet.
   Liefert garantiert wasserdichte Boolesche Operationen auch für sehr feine Netze.
   ============================================================ */
F.manifold = (function () {
  const B64 = '${b64}';
  const M = { lib: null, error: null, version: '${ver}', ready: null };
  let factory = null;
  M.init = function () {
    if (M.ready) return M.ready;
    M.ready = (async () => {
      if (!factory) factory = (function () { ${js}\n return Module; })();
      if (typeof WebAssembly !== 'object') throw new Error('WebAssembly nicht verfügbar');
      const bin = Uint8Array.from(atob(B64), c => c.charCodeAt(0));
      const lib = await factory({ wasmBinary: bin, locateFile: f => f });
      lib.setup(); M.lib = lib; return lib;
    })().catch(e => { M.error = e && e.message ? e.message : String(e); M.lib = null; console.warn('[Formwerk] Manifold nicht verfügbar, BSP-Booleans bleiben aktiv:', M.error); return null; });
    return M.ready;
  };
  return M;
})();
setTimeout(() => { try { F.manifold.init(); } catch (e) { /* ohne Manifold weiter */ } }, 600);
`;
fs.writeFileSync(path.join(__dirname, '../src/12-manifold.js'), out);
console.log('src/12-manifold.js', (out.length / 1024).toFixed(0) + ' KB, manifold-3d ' + ver);
