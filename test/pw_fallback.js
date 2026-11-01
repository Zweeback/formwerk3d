const { open } = require('./pwlib');
const CASES = [
  ['wasm-frei', {}],
  ['kein-WebAssembly', { noWasm: true }],
  ['CSP-ohne-wasm-unsafe-eval', { csp: "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com https://code.jquery.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:; worker-src blob:" }],
];
(async () => {
  for (const [name, o] of CASES) {
    const { br, pg, errs } = await open(Object.assign({ viewport: { width: 1200, height: 800 } }, o));
    const r = await pg.evaluate(async () => {
      const F = window.Formwerk3D; await Promise.race([F.manifold.init().catch(() => {}), new Promise(r => setTimeout(r, 4000))]);
      F.ui.clearScene(); const out = { lib: !!F.manifold.lib, err: String(F.manifold.error || '').slice(0, 120) };
      F.api.box({ w: 2, h: 0.8, d: 1.2, pos: [0, 0.4, 0], name: 'Block' }); F.api.cylinder({ rt: 0.3, rb: 0.3, h: 2, rot: [90, 0, 0], pos: [0, 0.4, 0], name: 'Loch' });
      try { const r = F.boolean('subtract', F.api.find('Block'), F.api.find('Loch'), false, 'Lager'); out.klein = { engine: F.csg.engine, tris: Math.round(r.geometry.attributes.position.count / 3) }; } catch (e) { out.klein = { FEHLER: e.message }; }
      F.ui.clearScene(); F.api.sphere({ r: 1, ws: 300, hs: 150, name: 'A' }); F.api.sphere({ r: 1, ws: 300, hs: 150, pos: [0.6, 0, 0], name: 'B' });
      try { const r = F.boolean('subtract', F.api.find('A'), F.api.find('B'), false); out.gross = { engine: F.csg.engine, tris: Math.round(r.geometry.attributes.position.count / 3) }; } catch (e) { out.gross = { meldung: e.message.slice(0, 160) }; }
      return out; });
    console.log(name, JSON.stringify(r), '| Seitenfehler:', errs.filter(e => /PAGEERR/.test(e)).length); await br.close();
  }
})().catch(e => { console.log('FEHLER', e.stack); process.exit(2); });
