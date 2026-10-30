/* ============================================================
   Formwerk 3D – Kern: Helfer, Verlauf (Undo/Redo), Meldungen
   ============================================================ */
const F = (window.Formwerk = { version: '1.0', ticks: [] });
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : (d || 0); };
const fix = (n, d) => +(+n).toFixed(d === undefined ? 3 : d);
const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const uid = (() => { let i = 0; return () => ++i; })();

/* Minimaler DOM-Builder: h('div',{class:'x',onclick:fn},'Text',child) */
function h(tag, attrs) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (let i = 2; i < arguments.length; i++) add(arguments[i]);
  function add(c) {
    if (c === undefined || c === null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return el;
}

/* ---------- Meldungen ---------- */
F.say = function (msg, kind, quiet) {
  F.say.last = msg; const s = $('#status-msg'); if (s) { s.textContent = msg; s.dataset.kind = kind || ''; }
  const t = $('#toast');
  if (t && quiet) t.classList.remove('show');
  else if (t) {
    t.textContent = msg; t.dataset.kind = kind || ''; t.classList.add('show');
    clearTimeout(F.say._t); F.say._t = setTimeout(() => t.classList.remove('show'), kind === 'err' ? 5200 : 2200);
  }
  if (kind === 'err') console.warn('[Formwerk]', msg);
};

/* ---------- Verlauf (Rückgängig / Wiederholen) ---------- */
const H = F.history = {
  undo: [], redo: [], max: 80,
  push(label, undo, redo, free) {
    this.undo.push({ label, undo, redo, free });
    this.redo.forEach(e => e.free && e.free.clear && e.free.clear());
    this.redo.length = 0;
    while (this.undo.length > this.max) { const o = this.undo.shift(); o.free && o.free.evict && o.free.evict(); }
    F.ui && F.ui.refreshHistory && F.ui.refreshHistory();
  },
  back() {
    const e = this.undo.pop(); if (!e) return;
    try { e.undo(); } catch (err) { F.say('Rückgängig fehlgeschlagen: ' + err.message, 'err'); }
    this.redo.push(e); F.say('Rückgängig: ' + e.label); after();
  },
  forward() {
    const e = this.redo.pop(); if (!e) return;
    try { e.redo(); } catch (err) { F.say('Wiederholen fehlgeschlagen: ' + err.message, 'err'); }
    this.undo.push(e); F.say('Wiederholt: ' + e.label); after();
  },
  clear() { this.undo.length = 0; this.redo.length = 0; F.ui && F.ui.refreshHistory && F.ui.refreshHistory(); }
};
function after() {
  F.view && F.view.refreshAll && F.view.refreshAll();
  F.ui && F.ui.refreshHistory && F.ui.refreshHistory();
}

/* Datei- und Zwischenablage-Hilfen (in Chat-Sandboxes oft eingeschränkt) */
/* THREE.Color -> '#rrggbb'. getHexString() schneidet in r147 ab (1.0 wird 'fe'), hier wird gerundet. */
F.hex = function (c) {
  const lin = !!(window.THREE && THREE.ColorManagement && THREE.ColorManagement.legacyMode === false);
  const out = v => { if (lin) v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0'); };
  return '#' + out(c.r) + out(c.g) + out(c.b);
};
F.copyText = function (text, okMsg) {
  const done = () => F.say(okMsg || 'In die Zwischenablage kopiert');
  const fallback = () => {
    const ta = h('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' } }); ta.value = text;
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy') ? done() : F.say('Kopieren nicht erlaubt – Text im Feld markieren und mit Strg+C kopieren', 'err'); }
    catch (e) { F.say('Kopieren nicht erlaubt – Text im Feld markieren und mit Strg+C kopieren', 'err'); }
    ta.remove();
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  } catch (e) { fallback(); }
};
F.saveBlob = function (blob, name) {
  try {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    F.say('Download gestartet: ' + name + ' (falls nichts passiert: „Kopieren“ nutzen, Downloads sind in manchen Chat-Fenstern gesperrt)');
  } catch (e) { F.say('Download nicht möglich – bitte „Kopieren“ nutzen', 'err'); }
};
