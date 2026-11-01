const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TH = path.join(__dirname, '../pkg/node_modules/three');
exports.open = async function (opts) {
  opts = opts || {}; const file = opts.file || '../dist/formwerk3d.artifact.html';
  const frag = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const page_html = '<!doctype html><html lang="de"><head><meta charset="utf-8">' + (opts.csp ? '<meta http-equiv="Content-Security-Policy" content="' + opts.csp + '">' : '') + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + frag + '</body></html>';
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const ctx = await br.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, colorScheme: opts.scheme || 'light', deviceScaleFactor: 1 });
  if (opts.noWasm) await ctx.addInitScript(() => { delete window.WebAssembly; });
  const pg = await ctx.newPage(); const errs = []; pg.errs = errs;
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message)); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/ERR_FAILED|Failed to load resource/.test(t)) errs.push(m.type() + ' ' + t.slice(0, 240)); } });
  await pg.route('**/*', r => { const u = r.request().url(); let f = null;
    if (/three\.min\.js/.test(u)) f = path.join(TH, 'build/three.min.js'); else { const m = /examples\/js\/(.+)$/.exec(u); if (m) f = path.join(TH, 'examples/js', m[1]); }
    if (f && fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' });
    if (/^(about|data|blob):/.test(u)) return r.continue(); return r.abort(); });
  await pg.setContent(page_html, { waitUntil: 'load' });
  await pg.waitForFunction(() => window.Formwerk3D && window.Formwerk3D.view.objects().length >= 3, null, { timeout: 25000 });
  await pg.waitForTimeout(400); return { br, ctx, pg, errs };
};
