/* ============================================================
   Punktwolken und Gaussian Splats: Einlesen (PLY, .splat, XYZ/PTS/CSV,
   PCD, LAS), Vorschau als Punkte bzw. runde Splat-Scheiben, Umwandlung
   in ein Dreiecksnetz (Dichtefeld → Surface Nets → Glätten → Farben).
   ============================================================ */
F.pc = (function () {
  const C = { layers: [], capPoints: 1500000, capSplats: 450000 };
  const sigmoid = x => 1 / (1 + Math.exp(-x)), SH0 = 0.28209479177387814;
  const TS = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const rd = (dv, t, o, le) => { switch (t) { case 'char': case 'int8': return dv.getInt8(o); case 'uchar': case 'uint8': return dv.getUint8(o); case 'short': case 'int16': return dv.getInt16(o, le); case 'ushort': case 'uint16': return dv.getUint16(o, le); case 'int': case 'int32': return dv.getInt32(o, le); case 'uint': case 'uint32': return dv.getUint32(o, le); case 'float': case 'float32': return dv.getFloat32(o, le); default: return dv.getFloat64(o, le); } };

  /* ---- PLY allgemein (ASCII und binär), liefert Punkte und Flächen ---- */
  C.parsePLY = function (buf) {
    const u8 = new Uint8Array(buf); let he = -1; const tag = 'end_header';
    for (let i = 0; i < Math.min(u8.length - 10, 65536); i++) { if (u8[i] === 101 && u8[i + 1] === 110 && u8[i + 2] === 100 && u8[i + 3] === 95) { let ok = true; for (let k = 0; k < 10; k++) if (u8[i + k] !== tag.charCodeAt(k)) { ok = false; break; } if (ok) { he = i + 10; break; } } }
    if (he < 0) throw new Error('Keine gültige PLY-Datei (Kopf fehlt)');
    while (u8[he] === 13 || u8[he] === 10) { he++; if (u8[he - 1] === 10) break; }
    const head = new TextDecoder().decode(u8.subarray(0, he)).split(/\r?\n/); let fmt = 'ascii'; const els = []; let cur = null;
    head.forEach(l => { const t = l.trim().split(/\s+/); if (t[0] === 'format') fmt = t[1]; else if (t[0] === 'element') { cur = { name: t[1], count: parseInt(t[2], 10), props: [] }; els.push(cur); } else if (t[0] === 'property' && cur) { if (t[1] === 'list') cur.props.push({ name: t[4], list: [t[2], t[3]] }); else cur.props.push({ name: t[2], type: t[1] }); } });
    const le = fmt !== 'binary_big_endian', out = { format: fmt, vertex: null, count: 0, faces: [] }; let off = he;
    const dv = new DataView(buf);
    let tokens = null, tp = 0; if (fmt === 'ascii') { tokens = new TextDecoder().decode(u8.subarray(he)).split(/\s+/); if (tokens[0] === '') tokens.shift(); }
    els.forEach(e => {
      const isV = e.name === 'vertex', cols = {}; if (isV) { e.props.forEach(p => { if (!p.list) cols[p.name] = new Float32Array(e.count); }); out.vertex = cols; out.count = e.count; }
      const simple = e.props.every(p => !p.list), stride = simple ? e.props.reduce((s, p) => s + TS[p.type], 0) : 0;
      for (let i = 0; i < e.count; i++) {
        if (fmt === 'ascii') {
          for (const p of e.props) { if (p.list) { const n = parseInt(tokens[tp++], 10), idx = []; for (let k = 0; k < n; k++) idx.push(parseInt(tokens[tp++], 10)); if (e.name === 'face' && (p.name === 'vertex_indices' || p.name === 'vertex_index')) for (let k = 1; k + 1 < n; k++) out.faces.push(idx[0], idx[k], idx[k + 1]); } else { const v = parseFloat(tokens[tp++]); if (isV) cols[p.name][i] = v; } }
        } else {
          let o = off; if (simple && isV) { for (const p of e.props) { cols[p.name][i] = rd(dv, p.type, o, le); o += TS[p.type]; } off += stride; continue; }
          for (const p of e.props) {
            if (p.list) { const n = rd(dv, p.list[0], o, le); o += TS[p.list[0]]; const idx = []; for (let k = 0; k < n; k++) { idx.push(rd(dv, p.list[1], o, le)); o += TS[p.list[1]]; } if (e.name === 'face' && (p.name === 'vertex_indices' || p.name === 'vertex_index')) for (let k = 1; k + 1 < n; k++) out.faces.push(idx[0], idx[k], idx[k + 1]); }
            else { const v = rd(dv, p.type, o, le); o += TS[p.type]; if (isV) cols[p.name][i] = v; }
          }
          off = o;
        }
      }
    });
    return out;
  };

  /* ---- PLY → Punktdaten (Splat erkennen) ---- */
  C.fromPLY = function (buf) {
    const r = C.parsePLY(buf), v = r.vertex; if (!v || !v.x) throw new Error('PLY ohne Punkte');
    const n = r.count, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = v.x[i]; pos[i * 3 + 1] = v.y[i]; pos[i * 3 + 2] = v.z[i]; }
    const d = { n, pos, col: null, size: null, alpha: null, kind: 'points', hasFaces: r.faces.length > 0 };
    if (v.f_dc_0 && v.opacity && v.scale_0) { // 3D Gaussian Splatting
      d.kind = 'splat'; d.col = new Float32Array(n * 3); d.size = new Float32Array(n); d.alpha = new Float32Array(n);
      for (let i = 0; i < n; i++) { d.col[i * 3] = clamp(0.5 + SH0 * v.f_dc_0[i], 0, 1); d.col[i * 3 + 1] = clamp(0.5 + SH0 * v.f_dc_1[i], 0, 1); d.col[i * 3 + 2] = clamp(0.5 + SH0 * v.f_dc_2[i], 0, 1); d.alpha[i] = sigmoid(v.opacity[i]); d.size[i] = 3 * Math.exp((v.scale_0[i] + v.scale_1[i] + v.scale_2[i]) / 3); }
    } else if (v.red || v.r) { const R = v.red || v.r, G = v.green || v.g, B = v.blue || v.b; d.col = new Float32Array(n * 3); let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, R[i]); const k = mx > 1.5 ? 1 / 255 : 1; for (let i = 0; i < n; i++) { d.col[i * 3] = R[i] * k; d.col[i * 3 + 1] = G[i] * k; d.col[i * 3 + 2] = B[i] * k; } }
    return d;
  };

  /* ---- .splat (32 Byte je Splat: Position, Skalierung, RGBA, Drehung) ---- */
  C.fromSplat = function (buf) {
    const n = Math.floor(buf.byteLength / 32); if (!n) throw new Error('Leere .splat-Datei'); const dv = new DataView(buf), u8 = new Uint8Array(buf);
    const d = { n, pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n), alpha: new Float32Array(n), kind: 'splat' };
    for (let i = 0; i < n; i++) { const o = i * 32; d.pos[i * 3] = dv.getFloat32(o, true); d.pos[i * 3 + 1] = dv.getFloat32(o + 4, true); d.pos[i * 3 + 2] = dv.getFloat32(o + 8, true);
      d.size[i] = 3 * Math.cbrt(Math.abs(dv.getFloat32(o + 12, true) * dv.getFloat32(o + 16, true) * dv.getFloat32(o + 20, true)) + 1e-12);
      d.col[i * 3] = u8[o + 24] / 255; d.col[i * 3 + 1] = u8[o + 25] / 255; d.col[i * 3 + 2] = u8[o + 26] / 255; d.alpha[i] = u8[o + 27] / 255; }
    return d;
  };

  /* ---- Text: XYZ / PTS / CSV ---- */
  C.fromText = function (text) {
    const lines = text.split(/\r?\n/), P = [], Cc = []; let cols = 0, hasCol = false, scale255 = false, first = true, count = 0;
    for (let li = 0; li < lines.length; li++) {
      const l = lines[li].trim(); if (!l || l[0] === '#' || l[0] === '/') continue; const t = l.split(/[\s,;]+/); if (first) { first = false; if (t.length === 1 && /^\d+$/.test(t[0])) continue; }
      const v = t.map(Number); if (v.length < 3 || v.some(x => !isFinite(x))) continue;
      if (!count) { cols = v.length; hasCol = cols >= 6 && !(cols === 6 && v.slice(3).every(x => Math.abs(x) <= 1.0001 && x !== Math.round(x))); scale255 = v.slice(cols >= 7 ? 4 : 3, cols >= 7 ? 7 : 6).some(x => x > 1.0001); }
      P.push(v[0], v[1], v[2]); if (hasCol) { const o = cols >= 7 ? 4 : 3; Cc.push(v[o] / (scale255 ? 255 : 1), v[o + 1] / (scale255 ? 255 : 1), v[o + 2] / (scale255 ? 255 : 1)); } count++;
    }
    if (count < 4) throw new Error('Keine Punkte im Text gefunden (erwartet: x y z [r g b] je Zeile)');
    return { n: count, pos: new Float32Array(P), col: hasCol ? new Float32Array(Cc) : null, size: null, alpha: null, kind: 'points' };
  };

  /* ---- PCD (ASCII oder binär, ohne Kompression) ---- */
  C.fromPCD = function (buf) {
    const u8 = new Uint8Array(buf), s = new TextDecoder().decode(u8.subarray(0, Math.min(4096, u8.length))), m = /DATA\s+(\w+)\s*\n/.exec(s); if (!m) throw new Error('PCD-Kopf nicht lesbar');
    const head = s.slice(0, m.index), g = k => { const r = new RegExp('^' + k + '\\s+(.+)$', 'm').exec(head); return r ? r[1].trim().split(/\s+/) : null; };
    const fields = g('FIELDS'), size = g('SIZE').map(Number), type = g('TYPE'), cnt = (g('COUNT') || fields.map(() => '1')).map(Number), n = parseInt(g('POINTS')[0], 10), off = m.index + m[0].length; let data = m[1];
    if (data === 'binary_compressed') throw new Error('PCD „binary_compressed“ wird nicht unterstützt – bitte als ASCII oder binary speichern');
    const idx = f => fields.indexOf(f), ix = idx('x'), iy = idx('y'), iz = idx('z'), irgb = idx('rgb') >= 0 ? idx('rgb') : idx('rgba'); if (ix < 0) throw new Error('PCD ohne x/y/z');
    const d = { n, pos: new Float32Array(n * 3), col: irgb >= 0 ? new Float32Array(n * 3) : null, size: null, alpha: null, kind: 'points' };
    if (data === 'ascii') { const lines = new TextDecoder().decode(u8.subarray(off)).split(/\r?\n/); let k = 0; for (const l of lines) { if (!l.trim() || k >= n) continue; const t = l.trim().split(/\s+/); d.pos[k * 3] = +t[ix]; d.pos[k * 3 + 1] = +t[iy]; d.pos[k * 3 + 2] = +t[iz]; if (irgb >= 0) { const f = +t[irgb], b = new DataView(new ArrayBuffer(4)); if (type[irgb] === 'F') { b.setFloat32(0, f, true); } else b.setUint32(0, f >>> 0, true); d.col[k * 3] = b.getUint8(2) / 255; d.col[k * 3 + 1] = b.getUint8(1) / 255; d.col[k * 3 + 2] = b.getUint8(0) / 255; } k++; } d.n = k; return d; }
    const offs = []; let o = 0; fields.forEach((f, i) => { offs.push(o); o += size[i] * cnt[i]; }); const stride = o, dv = new DataView(buf, off);
    for (let i = 0; i < n; i++) { const b = i * stride; d.pos[i * 3] = dv.getFloat32(b + offs[ix], true); d.pos[i * 3 + 1] = dv.getFloat32(b + offs[iy], true); d.pos[i * 3 + 2] = dv.getFloat32(b + offs[iz], true); if (irgb >= 0) { d.col[i * 3] = dv.getUint8(b + offs[irgb] + 2) / 255; d.col[i * 3 + 1] = dv.getUint8(b + offs[irgb] + 1) / 255; d.col[i * 3 + 2] = dv.getUint8(b + offs[irgb]) / 255; } }
    return d;
  };

  /* ---- LAS (unkomprimiert, Punktformate 0–10) ---- */
  C.fromLAS = function (buf) {
    const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x4653414C) throw new Error('Keine LAS-Datei'); const ver = dv.getUint8(24) * 10 + dv.getUint8(25), off = dv.getUint32(96, true); let fmt = dv.getUint8(104); const len = dv.getUint16(105, true);
    if (fmt & 0x80) throw new Error('Komprimierte LAZ-Dateien werden nicht unterstützt – bitte in LAS umwandeln (z. B. mit CloudCompare)'); fmt &= 0x3f;
    let n = dv.getUint32(107, true); if (!n && ver >= 14) n = Number(dv.getBigUint64(247, true)); const sc = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)], of = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)];
    const co = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 }[fmt]; const d = { n, pos: new Float32Array(n * 3), col: co !== undefined ? new Float32Array(n * 3) : null, size: null, alpha: null, kind: 'points' };
    let cx = of[0], cy = of[1], cz = of[2]; // große Koordinaten (UTM) auf lokale Werte bringen
    for (let i = 0; i < n; i++) { const o = off + i * len; d.pos[i * 3] = dv.getInt32(o, true) * sc[0] + of[0] - cx; d.pos[i * 3 + 1] = dv.getInt32(o + 8, true) * sc[2] + of[2] - cz; d.pos[i * 3 + 2] = -(dv.getInt32(o + 4, true) * sc[1] + of[1] - cy); // Z oben → Y oben
      if (co !== undefined) { d.col[i * 3] = dv.getUint16(o + co, true) / 65535; d.col[i * 3 + 1] = dv.getUint16(o + co + 2, true) / 65535; d.col[i * 3 + 2] = dv.getUint16(o + co + 4, true) / 65535; } }
    if (d.col) { let mx = 0; for (let i = 0; i < d.col.length; i++) mx = Math.max(mx, d.col[i]); if (mx < 0.02) d.col = null; }
    return d;
  };

  /* ---- Ebene (Vorschau) ---- */
  const vs = 'attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(size*scale/max(-mv.z,0.001),1.5,90.0); }';
  const fs = 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r2=dot(d,d)*4.0; if(r2>1.0) discard; float a=exp(-r2*2.6)*vA; if(a<0.16) discard; gl_FragColor=vec4(vC,1.0);\n#include <encodings_fragment>\n}';
  C.add = function (data, name, opt) {
    opt = opt || {}; let { n, pos, col, size, alpha } = data; const cap = data.kind === 'splat' ? C.capSplats : C.capPoints; let step = 1;
    if (n > cap) { step = Math.ceil(n / cap); const m = Math.floor(n / step), p2 = new Float32Array(m * 3), c2 = col ? new Float32Array(m * 3) : null, s2 = size ? new Float32Array(m) : null, a2 = alpha ? new Float32Array(m) : null; for (let i = 0; i < m; i++) { const j = i * step; p2.set(pos.subarray(j * 3, j * 3 + 3), i * 3); if (c2) c2.set(col.subarray(j * 3, j * 3 + 3), i * 3); if (s2) s2[i] = size[j]; if (a2) a2[i] = alpha[j]; } pos = p2; col = c2; size = s2; alpha = a2; n = m; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lin = new Float32Array(n * 3); // Farben (sRGB) → linear
    for (let i = 0; i < n * 3; i++) { const c = col ? col[i] : 0.72; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    g.setAttribute('color', new THREE.BufferAttribute(lin, 3)); g.computeBoundingBox(); g.computeBoundingSphere();
    // Größe aus Dichte schätzen, wenn nicht vorgegeben
    const bb = g.boundingBox, sz = bb.getSize(new THREE.Vector3()), dia = Math.max(sz.x, sz.y, sz.z) || 1;
    let obj, mat;
    if (data.kind === 'splat' && size) {
      const sizes = new Float32Array(size.subarray(0, n)), al = new Float32Array(alpha.subarray(0, n)); const k = step > 1 ? Math.sqrt(step) : 1; for (let i = 0; i < n; i++) sizes[i] = Math.min(sizes[i] * k, dia * 0.05);
      g.setAttribute('size', new THREE.BufferAttribute(sizes, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(al, 1));
      mat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { scale: { value: 600 } }, vertexColors: true, transparent: false, depthWrite: true });
      obj = new THREE.Points(g, mat); obj.onBeforeRender = (r) => { const hh = r.domElement.height || 600; mat.uniforms.scale.value = hh / (2 * Math.tan((V.persp.fov * DEG) / 2)); };
    } else {
      mat = new THREE.PointsMaterial({ size: opt.pointSize || 2.2, sizeAttenuation: false, vertexColors: true }); obj = new THREE.Points(g, mat);
    }
    obj.frustumCulled = false; obj.name = V.uniqueName(name || 'Punktwolke'); obj.userData.pc = true;
    if (data.kind === 'splat' && opt.flip !== false) obj.rotation.x = Math.PI; // COLMAP: Y zeigt nach unten
    const L = { name: obj.name, obj, kind: data.kind, n, total: data.n, step, data: { pos, col, size, alpha, n }, cell: dia / 120 };
    C.layers.push(L); V.world.add(obj);
    H.push('Import: ' + L.name, () => { V.world.remove(obj); F.ui.drawPanel(true); V.requestRender(); }, () => { V.world.add(obj); F.ui.drawPanel(true); V.requestRender(); });
    obj.updateMatrixWorld(true); V.frame([obj]); V.requestRender();
    F.say((data.kind === 'splat' ? 'Gaussian Splat' : 'Punktwolke') + ' „' + L.name + '“: ' + n.toLocaleString('de-DE') + (step > 1 ? ' von ' + data.n.toLocaleString('de-DE') : '') + ' Punkte angezeigt' + (data.kind === 'splat' ? ' · Vereinfachte Ansicht (runde Scheiben). „In Netz wandeln“ erzeugt ein Dreiecksnetz.' : ' · „In Netz wandeln“ erzeugt ein Dreiecksnetz.'));
    return L;
  };
  C.remove = function (L) { const i = C.layers.indexOf(L); if (i < 0) return; C.layers.splice(i, 1); V.world.remove(L.obj); L.obj.geometry.dispose(); V.requestRender(); F.ui.drawPanel(true); };
  C.clear = function () { C.layers.slice().forEach(L => { V.world.remove(L.obj); }); C.layers.length = 0; };
  C.setPointSize = function (L, px) { if (L.obj.material.isPointsMaterial) { L.obj.material.size = px; V.requestRender(); } };

  /* ---- Netz aus Punkten / Splats ---- */
  C.toMesh = async function (L, opt) {
    opt = opt || {}; const res = opt.res || 140, thr = opt.thr || 0.7, d = L.data, n = d.n; L.obj.updateMatrixWorld(true); const M = L.obj.matrixWorld, v = new THREE.Vector3();
    const P = new Float32Array(n * 3); for (let i = 0; i < n; i++) { v.set(d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]).applyMatrix4(M); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    // robuste Ausdehnung (0,3 %–99,7 %), Ausreißer außerhalb ignorieren
    const lo = [0, 0, 0], hi = [0, 0, 0], tmp = new Float32Array(n); for (let a = 0; a < 3; a++) { for (let i = 0; i < n; i++) tmp[i] = P[i * 3 + a]; tmp.sort(); lo[a] = tmp[Math.floor(n * 0.003)]; hi[a] = tmp[Math.min(n - 1, Math.floor(n * 0.997))]; }
    const side = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1, h = side / res, g = F.vox.grid(lo, hi, h, 4);
    F.say('Dichtefeld wird berechnet …', '', true); await F.vox.tick();
    const w = d.alpha ? Float32Array.from(d.alpha) : null; F.vox.splatPoints(g, P, w, d.size ? 1.6 : 1.5); F.vox.blur(g, 1); await F.vox.tick();
    const nz = []; for (let i = 0; i < g.d.length; i += 7) if (g.d[i] > 1e-6) nz.push(g.d[i]); if (nz.length < 20) throw new Error('Zu wenige Punkte für ein Netz'); nz.sort((a, b) => a - b);
    const level = nz[Math.floor(nz.length * 0.30)] * thr * 2; for (let i = 0; i < g.d.length; i++) g.d[i] = level - g.d[i];
    F.say('Fläche wird extrahiert …', '', true); await F.vox.tick();
    let geo = F.vox.surface(g, 0); if (!geo.index.count) throw new Error('Kein Netz entstanden – Schwelle verkleinern oder Auflösung erhöhen');
    geo = F.vox.compact(F.vox.dropSmall(geo, Math.max(60, Math.floor(geo.index.count / 3 * 0.003)))); if (!geo.index.count) throw new Error('Nur Kleinteile gefunden – Schwelle verkleinern');
    F.vox.taubin(geo, opt.smooth === undefined ? 6 : opt.smooth, 0.5, -0.53);
    if (d.col) { const sc = new Float32Array(d.col.length); for (let i = 0; i < sc.length; i++) { const c = d.col[i]; sc[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); } F.vox.colorFromPoints(geo, P, sc, h * 2, 1); }
    return geo;
  };
  return C;
})();
