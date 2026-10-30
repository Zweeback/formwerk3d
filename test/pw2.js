const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const TH = path.join(__dirname, '../node_modules/three');
const frag = fs.readFileSync(path.join(__dirname, '../dist/formwerk3d.artifact.min.html'), 'utf8');
const page_html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + frag + '</body></html>';
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await br.newContext({ viewport: { width: 400, height: 820 } }); const pg = await ctx.newPage();
  await pg.route('**/*', r => { const u = r.request().url(); let f = null; if (/three\.min\.js/.test(u)) f = path.join(TH, 'build/three.min.js'); else { const m = /examples\/js\/(.+)$/.exec(u); if (m) f = path.join(TH, 'examples/js', m[1]); } if (f && fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' }); if (/^(about|data|blob):/.test(u)) return r.continue(); return r.abort(); });
  await pg.setContent(page_html, { waitUntil: 'load' }); await pg.waitForFunction(() => window.Formwerk3D, null, { timeout: 20000 }); await pg.waitForTimeout(500);
  const wide = await pg.evaluate(() => { const out = []; document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > 401 && r.width > 0) { let p = e.parentElement, clipped = false; while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(hidden|auto|scroll)/.test(cs.overflowX)) { clipped = true; break; } p = p.parentElement; } if (!clipped) out.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : '')) + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width)); } }); return out.slice(0, 14); });
  console.log(wide.join('\n')); await br.close();
})();
