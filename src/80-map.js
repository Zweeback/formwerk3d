/* ============================================================
   Karten -> 3D: GeoJSON / Overpass-JSON, Höhenkarten, Beispielstadt
   Koordinaten: 1 Einheit = 1 m, Norden = -Z, Osten = +X, oben = +Y
   ============================================================ */
const MP = F.map = { data: null, hm: null, last: null };

const ROAD_W = { motorway: 14, trunk: 12, primary: 10, secondary: 8.5, tertiary: 7.5, unclassified: 6, residential: 6, living_street: 5, service: 3.5, pedestrian: 4, footway: 1.8, path: 1.4, cycleway: 2, track: 3, steps: 1.6, road: 6 };
const WATER_W = { river: 10, canal: 7, stream: 3, ditch: 1.5, drain: 1.5 };
const GREEN_LEISURE = /^(park|garden|pitch|playground|golf_course|nature_reserve|common|dog_park|recreation_ground)$/;
const GREEN_LAND = /^(grass|forest|meadow|recreation_ground|village_green|orchard|cemetery|allotments|greenfield|flowerbed)$/;
const GREEN_NAT = /^(wood|scrub|grassland|heath|fell|wetland)$/;

function isAreaTags(t) {
  return !!(t.building || t['building:part'] || t.landuse || t.leisure || t.water || t.area === 'yes' ||
    (t.natural && !/^(coastline|tree_row|cliff|ridge|valley)$/.test(t.natural)) || /^(riverbank|dock|boatyard)$/.test(t.waterway || ''));
}
/* Ordnet Tags einer Kategorie zu. area: Fläche (Ring) oder Linie. strict: nur echte OSM-Tags auswerten */
function classify(t, area, strict) {
  t = t || {};
  const k = String(t.kind || t.klasse || t.class || t.layer || '').toLowerCase();
  if (k) {
    if (/^(building|gebaeude|gebäude|haus)/.test(k)) return area ? 'building' : null;
    if (/^(road|street|strasse|straße|weg|highway|rail)/.test(k)) return 'road';
    if (/^(water|wasser|fluss|see|river)/.test(k)) return 'water';
    if (/^(green|gruen|grün|park|wald|forest|wiese)/.test(k)) return area ? 'green' : null;
  }
  if (t.building || t['building:part']) return area ? 'building' : null;
  if (t.highway) return (!area || t.area === 'yes' || /^(pedestrian|footway|service|living_street)$/.test(t.highway)) ? 'road' : null;
  if (t.railway && !area && !/^(abandoned|disused|razed)$/.test(t.railway)) return 'road';
  if (t.waterway) return 'water';
  if (t.natural === 'water' || t.water || t.landuse === 'reservoir' || t.landuse === 'basin') return area ? 'water' : null;
  if (area && (GREEN_LEISURE.test(t.leisure || '') || GREEN_LAND.test(t.landuse || '') || GREEN_NAT.test(t.natural || ''))) return 'green';
  if (strict) return null;
  return area ? 'building' : 'road';
}
const numTag = v => { if (v === undefined || v === null) return NaN; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
function heightOf(t, id) {
  let hh = numTag(t.height); if (!isFinite(hh)) hh = numTag(t['building:height']); if (!isFinite(hh)) hh = numTag(t.hoehe);
  if (!isFinite(hh)) { const lv = numTag(t['building:levels']); const lv2 = isFinite(lv) ? lv : numTag(t.levels || t.etagen); if (isFinite(lv2)) hh = lv2 * 3.2 + 1; }
  if (!isFinite(hh)) { let x = ((id | 0) * 2654435761) >>> 0; hh = 6 + (x % 900) / 100; } // 6–15 m, pro Objekt stabil
  return clamp(hh, 1, 900);
}
function widthOf(t, cls) {
  let w = numTag(t.width); if (isFinite(w) && w > 0) return w;
  if (cls === 'road') return t.railway ? 2.6 : (ROAD_W[t.highway] || 5);
  if (cls === 'water') return WATER_W[t.waterway] || 6;
  return 4;
}

/* ---------- Einlesen ---------- */
function cleanRing(r) {
  const o = []; for (const c of r) { if (!c || !isFinite(c[0]) || !isFinite(c[1])) continue; const l = o[o.length - 1]; if (!l || l[0] !== c[0] || l[1] !== c[1]) o.push([c[0], c[1]]); }
  if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o.pop();
  return o;
}
function stitch(lines) { // offene Wege zu geschlossenen Ringen verbinden
  lines = lines.map(l => l.slice()).filter(l => l.length > 1); const rings = [], eq = (a, b) => a[0] === b[0] && a[1] === b[1];
  while (lines.length) {
    let cur = lines.shift(), guard = 0;
    while (!eq(cur[0], cur[cur.length - 1]) && guard++ < 5000) {
      let found = -1, rev = false; const end = cur[cur.length - 1];
      for (let i = 0; i < lines.length; i++) { if (eq(lines[i][0], end)) { found = i; break; } if (eq(lines[i][lines[i].length - 1], end)) { found = i; rev = true; break; } }
      if (found < 0) break; let nx = lines.splice(found, 1)[0]; if (rev) nx.reverse(); cur = cur.concat(nx.slice(1));
    }
    if (cur.length >= 4 && eq(cur[0], cur[cur.length - 1])) rings.push(cleanRing(cur));
  }
  return rings;
}
function fromGeoJSON(j, out) {
  const feat = (geom, props, id) => {
    if (!geom) return; const t = props && (props.tags && typeof props.tags === 'object' ? Object.assign({}, props, props.tags) : props) || {};
    const strict = out.hasTags;
    switch (geom.type) {
      case 'Polygon': { const c = classify(t, true, strict); if (c) out.f.push({ cls: c, rings: geom.coordinates.map(cleanRing), t, id }); break; }
      case 'MultiPolygon': geom.coordinates.forEach(pl => { const c = classify(t, true, strict); if (c) out.f.push({ cls: c, rings: pl.map(cleanRing), t, id }); }); break;
      case 'LineString': { const c = classify(t, false, strict); if (c) out.f.push({ cls: c, line: geom.coordinates.map(p => [p[0], p[1]]), t, id }); break; }
      case 'MultiLineString': geom.coordinates.forEach(l => { const c = classify(t, false, strict); if (c) out.f.push({ cls: c, line: l.map(p => [p[0], p[1]]), t, id }); }); break;
      case 'GeometryCollection': (geom.geometries || []).forEach(g => feat(g, props, id)); break;
    }
  };
  const walk = (o, n) => {
    if (!o) return; if (Array.isArray(o)) { o.forEach((x, i) => walk(x, i)); return; }
    if (o.type === 'FeatureCollection') (o.features || []).forEach((f, i) => walk(f, i));
    else if (o.type === 'Feature') feat(o.geometry, o.properties, o.id || n);
    else if (o.type && o.coordinates) feat(o, {}, n);
  };
  // gibt es überhaupt OSM-artige Tags? dann streng klassifizieren
  const probe = o => { if (Array.isArray(o)) return o.some(probe); if (o && o.type === 'FeatureCollection') return (o.features || []).some(probe); if (o && o.type === 'Feature') { const p = o.properties || {}; const t = p.tags || p; return !!(t.building || t.highway || t.waterway || t.natural || t.landuse || t.leisure || t.railway || t.water || t.kind || t.klasse || t.class || t.layer); } return false; };
  out.hasTags = probe(j); walk(j, 0);
}
function fromOverpass(j, out) {
  const nodes = new Map(), ways = new Map(); const els = j.elements || [];
  els.forEach(e => { if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat]); });
  const wayPts = e => e.geometry ? e.geometry.filter(g => g).map(g => [g.lon, g.lat]) : (e.nodes || []).map(n => nodes.get(n)).filter(Boolean);
  els.forEach(e => { if (e.type === 'way') ways.set(e.id, e); });
  els.forEach(e => {
    const t = e.tags || {};
    if (e.type === 'way') {
      if (!Object.keys(t).length) return; const pts = wayPts(e); if (pts.length < 2) return;
      const closed = pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
      const area = closed && isAreaTags(t) && !(t.highway && t.area !== 'yes');
      const c = classify(t, area, true); if (!c) return;
      if (area) out.f.push({ cls: c, rings: [cleanRing(pts)], t, id: e.id }); else out.f.push({ cls: c, line: pts, t, id: e.id });
    } else if (e.type === 'relation') {
      if (!(t.type === 'multipolygon' || t.type === 'building' || t.building)) return;
      const outer = [], inner = [];
      (e.members || []).forEach(m => {
        if (m.type !== 'way') return; const w = ways.get(m.ref); const pts = m.geometry ? m.geometry.filter(g => g).map(g => [g.lon, g.lat]) : (w ? wayPts(w) : []);
        if (pts.length < 2) return; (m.role === 'inner' ? inner : outer).push(pts);
      });
      const c = classify(t, true, true); if (!c) return;
      const os = stitch(outer), is = stitch(inner); if (!os.length) return;
      // Innenringe dem ersten Außenring zuordnen, der den ersten Punkt enthält
      os.forEach(o => out.f.push({ cls: c, rings: [o].concat(is.filter(r => pointInRing(r[0], o))), t, id: e.id }));
    }
  });
}
function pointInRing(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if (((r[i][1] > p[1]) !== (r[j][1] > p[1])) && (p[0] < (r[j][0] - r[i][0]) * (p[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0])) c = !c; } return c; }

MP.parse = function (text, opts) {
  opts = opts || {};
  text = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  if (!text) throw new Error('Kein Text eingefügt');
  let j; try { j = JSON.parse(text); } catch (e) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}'); const a2 = text.indexOf('['), b2 = text.lastIndexOf(']');
    try { j = JSON.parse(a >= 0 && (a2 < 0 || a < a2) ? text.slice(a, b + 1) : text.slice(a2, b2 + 1)); } catch (e2) { throw new Error('Kein gültiges JSON – erwartet: GeoJSON oder Overpass-JSON'); }
  }
  const out = { f: [], source: '' };
  if (j && Array.isArray(j.elements)) { out.source = 'Overpass'; fromOverpass(j, out); }
  else if (Array.isArray(j) && j.length && Array.isArray(j[0]) && typeof j[0][0] === 'number') { out.source = 'Koordinatenliste'; out.f.push({ cls: 'building', rings: [cleanRing(j)], t: {}, id: 1 }); }
  else { out.source = 'GeoJSON'; fromGeoJSON(j, out); }
  if (!out.f.length) throw new Error('Keine passenden Objekte gefunden (Gebäude, Straßen, Wasser, Grün)');
  // Begrenzungsbox + Projektion
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const ext = c => { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; };
  out.f.forEach(f => { if (f.rings) f.rings.forEach(r => r.forEach(ext)); if (f.line) f.line.forEach(ext); });
  const planar = opts.planar !== undefined && opts.planar !== null ? !!opts.planar : (x0 < -180 || x1 > 180 || y0 < -90 || y1 > 90 || (Math.max(x1 - x0, y1 - y0) > 5));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, kx = planar ? 1 : 111320 * Math.cos(cy * DEG), ky = planar ? 1 : 110540;
  out.planar = planar; out.center = [cx, cy]; out.bbox = [x0, y0, x1, y1];
  out.P = c => [(c[0] - cx) * kx, -(c[1] - cy) * ky];
  out.counts = { building: 0, road: 0, water: 0, green: 0 }; out.f.forEach(f => out.counts[f.cls]++);
  out.sizeM = [(x1 - x0) * kx, (y1 - y0) * ky];
  MP.data = out; return out;
};
MP.summary = function () {
  const d = MP.data; if (!d) return 'Keine Kartendaten geladen';
  const c = d.counts; return d.source + ': ' + c.building + ' Gebäude · ' + c.road + ' Straßen · ' + c.water + ' Wasser · ' + c.green + ' Grün · ' + Math.round(d.sizeM[0]) + ' × ' + Math.round(d.sizeM[1]) + ' m' + (d.planar ? ' (Meter-Koordinaten)' : '');
};

/* ---------- Höhe (Gelände) ---------- */
MP.height = function (x, z) {
  const m = MP.hm; if (!m) return 0;
  const u = clamp((x - (m.cx || 0) + m.sx / 2) / m.sx * (m.w - 1), 0, m.w - 1), v = clamp((z - (m.cz || 0) + m.sz / 2) / m.sz * (m.h - 1), 0, m.h - 1);
  const i = Math.min(m.w - 2, Math.floor(u)), j = Math.min(m.h - 2, Math.floor(v)), fu = u - i, fv = v - j, d = m.data, w = m.w;
  return (d[j * w + i] * (1 - fu) + d[j * w + i + 1] * fu) * (1 - fv) + (d[(j + 1) * w + i] * (1 - fu) + d[(j + 1) * w + i + 1] * fu) * fv;
};

/* ---------- Geometrie-Bausteine ---------- */
const acc = () => ({ p: [], u: [] });
function tri(A, a, b, c, ua, ub, uc) { A.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); A.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]); }
function area2(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s / 2; }
function orient(r, pos) { return (area2(r) > 0) === pos ? r : r.slice().reverse(); }
function triangulate(rings) { // [[x,z]..] mit Löchern -> Dreiecke als Punktetripel
  const V2 = r => r.map(p => new THREE.Vector2(p[0], p[1])); const contour = V2(rings[0]), holes = rings.slice(1).map(V2);
  let idx; try { idx = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { idx = []; }
  const all = contour.concat(...holes); const res = [];
  if (!idx.length && rings[0].length >= 3) { for (let i = 1; i < rings[0].length - 1; i++) idx.push([0, i, i + 1]); }
  idx.forEach(t => res.push([all[t[0]], all[t[1]], all[t[2]]])); return res;
}
function flat(A, rings, yf, uvs) { // waagerechte Fläche, Normale +Y
  triangulate(rings).forEach(t => {
    let [a, b, c] = t; const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); if (cr > 0) { const q = b; b = c; c = q; }
    const P = p => [p.x, yf(p.x, p.y), p.y], U = p => [p.x / uvs, p.y / uvs]; tri(A, P(a), P(b), P(c), U(a), U(b), U(c));
  });
}
function wallRing(A, r, top, Y) { // Außenring A>0; Löcher A<0 – gleiche Reihenfolge ergibt jeweils nach außen (bzw. ins Loch) zeigende Wände
  let run = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 1e-4) continue;
    const a = [p[0], Y(p[0], p[1]), p[1]], b = [q[0], Y(q[0], q[1]), q[1]], a2 = [p[0], top, p[1]], b2 = [q[0], top, q[1]];
    const u0 = run / 3, u1 = (run + len) / 3, v0 = a[1] / 3, v1 = top / 3, v0b = b[1] / 3;
    tri(A, a, b2, b, [u0, v0], [u1, v1], [u1, v0b]); tri(A, a, a2, b2, [u0, v0], [u0, v1], [u1, v1]); run += len;
  }
}
function resample(pts, maxLen) {
  const o = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen)); for (let k = 1; k <= n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  return o;
}
function ribbon(A, pts, w, yf, uvs) {
  const c = []; pts.forEach(p => { const l = c[c.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-3) c.push(p); }); if (c.length < 2) return;
  const n = c.length, dir = [], L = [], R = [];
  for (let i = 0; i < n - 1; i++) { const dx = c[i + 1][0] - c[i][0], dz = c[i + 1][1] - c[i][1], l = Math.hypot(dx, dz); dir.push([dx / l, dz / l]); }
  for (let i = 0; i < n; i++) {
    const a = dir[Math.max(0, i - 1)], b = dir[Math.min(n - 2, i)]; let nx = -(a[1] + b[1]), nz = a[0] + b[0]; const m = Math.hypot(nx, nz);
    if (m < 1e-6) { nx = -b[1]; nz = b[0]; } else { nx /= m; nz /= m; }
    const dot = Math.max(0.45, nx * -b[1] + nz * b[0]), k = (w / 2) / dot;
    L.push([c[i][0] + nx * k, c[i][1] + nz * k]); R.push([c[i][0] - nx * k, c[i][1] - nz * k]);
  }
  let run = 0;
  for (let i = 0; i < n - 1; i++) {
    const seg = Math.hypot(c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1]), u0 = run / uvs, u1 = (run + seg) / uvs; run += seg;
    const P = p => [p[0], yf(p[0], p[1]), p[1]];
    tri(A, P(L[i]), P(L[i + 1]), P(R[i]), [u0, 1], [u1, 1], [u0, 0]); tri(A, P(R[i]), P(L[i + 1]), P(R[i + 1]), [u0, 0], [u1, 1], [u1, 0]);
  }
}

/* ---------- Szene aus Kartendaten erzeugen ---------- */
MP.build = function (o) {
  const D = MP.data; if (!D) { F.say('Zuerst Kartendaten laden', 'err'); return null; }
  o = Object.assign({ buildings: true, roads: true, water: true, green: true, ground: true, heightScale: 1, roadScale: 1, drape: true, limit: 6000, minArea: 4 }, o || {});
  const drape = o.drape && !!MP.hm, Y = drape ? ((x, z) => MP.height(x, z)) : (() => 0);
  const A = { b: acc(), r: acc(), w: acc(), g: acc() }, st = { b: 0, r: 0, w: 0, g: 0, skipped: 0 };
  let mx0 = Infinity, mx1 = -Infinity, mz0 = Infinity, mz1 = -Infinity; const grow = p => { if (p[0] < mx0) mx0 = p[0]; if (p[0] > mx1) mx1 = p[0]; if (p[1] < mz0) mz0 = p[1]; if (p[1] > mz1) mz1 = p[1]; };
  const prep = f => f.rings.map(r => r.map(D.P)).filter(r => r.length >= 3);
  let blds = D.f.filter(f => f.cls === 'building' && f.rings);
  if (o.buildings) {
    blds = blds.map(f => ({ f, rings: prep(f) })).filter(x => x.rings.length && Math.abs(area2(x.rings[0])) >= o.minArea);
    if (blds.length > o.limit) { blds.sort((a, b) => Math.abs(area2(b.rings[0])) - Math.abs(area2(a.rings[0]))); st.skipped = blds.length - o.limit; blds = blds.slice(0, o.limit); }
    blds.forEach(x => {
      const rings = x.rings.map((r, i) => orient(r, i === 0)), outer = rings[0]; outer.forEach(grow);
      let base = Infinity; if (drape) outer.forEach(p => { base = Math.min(base, Y(p[0], p[1])); }); else base = 0;
      const top = base + heightOf(x.f.t, x.f.id) * o.heightScale + (drape ? 0 : 0);
      rings.forEach(r => wallRing(A.b, r, top, Y)); flat(A.b, rings, () => top, 10); st.b++;
    });
  }
  D.f.forEach(f => {
    if (f.cls === 'building') return;
    if (f.cls === 'road' && o.roads) {
      const w = widthOf(f.t, 'road') * o.roadScale, yf = (x, z) => Y(x, z) + 0.06;
      if (f.line) { let pts = f.line.map(D.P); pts.forEach(grow); if (drape) pts = resample(pts, 8); ribbon(A.r, pts, w, yf, 6); st.r++; }
      else if (f.rings) { const rs = prep(f).map((r, i) => orient(r, i === 0)); if (rs.length) { rs[0].forEach(grow); flat(A.r, rs, yf, 6); st.r++; } }
    } else if (f.cls === 'water' && o.water) {
      const yf = (x, z) => Y(x, z) + 0.03;
      if (f.line) { let pts = f.line.map(D.P); pts.forEach(grow); if (drape) pts = resample(pts, 8); ribbon(A.w, pts, widthOf(f.t, 'water') * o.roadScale, yf, 10); st.w++; }
      else if (f.rings) { const rs = prep(f).map((r, i) => orient(r, i === 0)); if (rs.length) { rs[0].forEach(grow); flat(A.w, rs, yf, 12); st.w++; } }
    } else if (f.cls === 'green' && o.green && f.rings) {
      const rs = prep(f).map((r, i) => orient(r, i === 0)); if (rs.length) { rs[0].forEach(grow); flat(A.g, rs, (x, z) => Y(x, z) + 0.015, 8); st.g++; }
    }
  });
  if (!isFinite(mx0)) { F.say('Nichts zum Erzeugen (alle Kategorien aus?)', 'err'); return null; }
  const made = [], old = V.objects().filter(m => m.userData.mapGen);
  old.forEach(m => V._detach(m)); /* zuerst entfernen, damit die neuen Ebenen ihre sauberen Namen behalten */
  const mk = (a, name, color, rough) => {
    if (!a.p.length) return; const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(a.u, 2)); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = V.addMesh(g, { name, color: new THREE.Color(color), position: [0, 0, 0], dropToGrid: false, silent: true, kind: 'map' });
    m.material.side = THREE.DoubleSide; m.material.roughness = rough; m.material.metalness = 0; m.userData.mapGen = true; made.push(m);
  };
  mk(A.g, 'Grünflächen', '#6aa84f', 0.95); mk(A.w, 'Wasser', '#3d7fb8', 0.25); mk(A.r, 'Straßen', '#4a4f57', 0.9); mk(A.b, 'Gebäude', '#d8d2c4', 0.8);
  if (o.ground && !drape) {
    const mg = Math.max(4, Math.max(mx1 - mx0, mz1 - mz0) * 0.04), g = new THREE.BoxGeometry(mx1 - mx0 + 2 * mg, 0.6, mz1 - mz0 + 2 * mg); g.translate((mx0 + mx1) / 2, -0.31, (mz0 + mz1) / 2);
    const m = V.addMesh(g, { name: 'Boden', color: new THREE.Color('#c9c3b3'), position: [0, 0, 0], dropToGrid: false, silent: true, kind: 'mesh' }); m.material.roughness = 1; m.userData.mapGen = true; made.unshift(m);
  }
  MP.last = { extent: { minX: mx0, maxX: mx1, minZ: mz0, maxZ: mz1 } };
  H.push('Karte → 3D', () => { made.forEach(m => V._detach(m)); old.forEach(m => V._attach(m)); }, () => { old.forEach(m => V._detach(m)); made.forEach(m => V._attach(m)); });
  if (made.length) { V.select(made[made.length - 1]); } V.refreshAll(); V.frame(made);
  const tris = made.reduce((s, m) => s + F.geo.stats(m.geometry).tris, 0);
  F.say(st.b + ' Gebäude, ' + st.r + ' Straßen, ' + st.w + ' Wasser, ' + st.g + ' Grün · ' + tris + ' Dreiecke' + (st.skipped ? ' · ' + st.skipped + ' kleine Gebäude ausgelassen (Limit)' : ''));
  return made;
};

/* ---------- Höhenkarten / Gelände ---------- */
MP.terrainFromGrid = function (data, w, h, o) {
  o = Object.assign({ sx: 400, sz: 400, name: 'Gelände', color: '#8a9a6b' }, o || {});
  if (MP.last && !o.keepSize) { o.sx = Math.max(10, MP.last.extent.maxX - MP.last.extent.minX); o.sz = Math.max(10, MP.last.extent.maxZ - MP.last.extent.minZ); }
  const cx = MP.last ? (MP.last.extent.minX + MP.last.extent.maxX) / 2 : 0, cz = MP.last ? (MP.last.extent.minZ + MP.last.extent.maxZ) / 2 : 0;
  MP.hm = { w, h, data, sx: o.sx, sz: o.sz, cx, cz };
  const pos = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2), idx = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; pos[k * 3] = -o.sx / 2 + i / (w - 1) * o.sx; pos[k * 3 + 1] = data[k]; pos[k * 3 + 2] = -o.sz / 2 + j / (h - 1) * o.sz; uv[k * 2] = i / (w - 1); uv[k * 2 + 1] = 1 - j / (h - 1); }
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i; idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  const m = V.addMesh(g, { name: o.name, color: new THREE.Color(o.color), position: [cx, 0, cz], dropToGrid: false, kind: 'terrain' }); m.material.roughness = 1; m.material.side = THREE.DoubleSide;
  let lo = Infinity, hi = -Infinity; for (let k = 0; k < data.length; k++) { if (data[k] < lo) lo = data[k]; if (data[k] > hi) hi = data[k]; }
  m.userData.terrain = true; V.frame([m]); F.say('Gelände ' + w + ' × ' + h + ' Punkte, ' + Math.round(o.sx) + ' × ' + Math.round(o.sz) + ' m, Höhe ' + fix(lo, 1) + '…' + fix(hi, 1) + ' m. Karte danach mit „Auf Gelände setzen“ erzeugen.');
  return m;
};
MP.terrainFromImage = function (img, o) {
  o = Object.assign({ mode: 'gray', height: 40, maxRes: 160 }, o || {});
  const sc = Math.min(1, o.maxRes / Math.max(img.width, img.height)), w = Math.max(2, Math.round(img.width * sc)), h = Math.max(2, Math.round(img.height * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); const px = x.getImageData(0, 0, w, h).data, d = new Float32Array(w * h);
  if (o.mode === 'terrarium') { let mn = Infinity; for (let k = 0; k < w * h; k++) { d[k] = px[k * 4] * 256 + px[k * 4 + 1] + px[k * 4 + 2] / 256 - 32768; if (d[k] < mn) mn = d[k]; } for (let k = 0; k < d.length; k++) d[k] = (d[k] - mn) * (o.exag || 1); }
  else for (let k = 0; k < w * h; k++) d[k] = (0.299 * px[k * 4] + 0.587 * px[k * 4 + 1] + 0.114 * px[k * 4 + 2]) / 255 * o.height;
  if (!(MP.last)) { o.sx = 400; o.sz = 400 * h / w; o.keepSize = true; }
  return MP.terrainFromGrid(d, w, h, o);
};
MP.terrainFromFile = function (file, o) {
  return new Promise((res, rej) => {
    const fr = new FileReader(); fr.onerror = () => rej(new Error('Datei nicht lesbar'));
    fr.onload = () => { const im = new Image(); im.onload = () => { try { res(MP.terrainFromImage(im, o)); } catch (e) { rej(e); } }; im.onerror = () => rej(new Error('Kein Bild')); im.src = fr.result; };
    fr.readAsDataURL(file);
  });
};
MP.noiseTerrain = function (o) {
  o = Object.assign({ height: 30, scale: 4, seed: 7, res: 96 }, o || {}); const w = o.res, h = o.res, d = new Float32Array(w * h);
  const hash = (x, y) => { let n = (x * 374761393 + y * 668265263 + o.seed * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = smooth01(x - xi), fy = smooth01(y - yi); return (hash(xi, yi) * (1 - fx) + hash(xi + 1, yi) * fx) * (1 - fy) + (hash(xi, yi + 1) * (1 - fx) + hash(xi + 1, yi + 1) * fx) * fy; };
  let mn = Infinity, mxv = -Infinity;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let v = 0, a = 1, f = o.scale, s = 0; for (let k = 0; k < 4; k++) { v += vn(i / w * f, j / h * f) * a; s += a; a *= 0.5; f *= 2; } v /= s; d[j * w + i] = v; mn = Math.min(mn, v); mxv = Math.max(mxv, v); }
  for (let k = 0; k < d.length; k++) d[k] = (d[k] - mn) / (mxv - mn || 1) * o.height;
  return MP.terrainFromGrid(d, w, h, o);
};
MP.clearTerrain = function () { MP.hm = null; };

/* ---------- Overpass-Abfrage (zum Kopieren) ---------- */
MP.query = function (south, west, north, east) {
  const b = [south, west, north, east].map(v => fix(v, 5)).join(',');
  return '[out:json][timeout:60];\n(\n  way["building"](' + b + ');\n  relation["building"](' + b + ');\n  way["highway"](' + b + ');\n  way["railway"~"^(rail|tram|light_rail|subway)$"](' + b + ');\n  way["natural"="water"](' + b + ');\n  relation["natural"="water"](' + b + ');\n  way["waterway"](' + b + ');\n  way["leisure"~"^(park|garden|pitch|playground)$"](' + b + ');\n  way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green)$"](' + b + ');\n);\nout geom;';
};

/* ---------- Beispielstadt (offline, als GeoJSON erzeugt) ---------- */
MP.sampleGeoJSON = function () {
  const lon0 = 7.4653, lat0 = 51.5136, kx = 111320 * Math.cos(lat0 * DEG), ky = 110540; let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const ll = (x, y) => [fix(lon0 + x / kx, 7), fix(lat0 - y / ky, 7)]; // y nach Süden = positiv
  const F2 = [], poly = (pts, props) => F2.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(p => ll(p[0], p[1]))] } });
  const line = (pts, props) => F2.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: pts.map(p => ll(p[0], p[1])) } });
  const E = [-180, -120, 0, 120, 180], S = [-120, 0, 120];
  S.forEach((v, i) => { line([[-200, v], [200, v]], { highway: i === 1 ? 'primary' : 'residential', name: 'Straße ' + (i + 1) }); line([[v, -200], [v, 200]], { highway: i === 1 ? 'secondary' : 'residential', name: 'Allee ' + (i + 1) }); });
  line([[-200, 190], [200, 190]], { railway: 'rail' });
  // Fluss im Norden
  const rv = []; for (let i = 0; i <= 20; i++) rv.push([-200 + i * 20, -168 + Math.sin(i * 0.55) * 8 - 9]); const rv2 = []; for (let i = 20; i >= 0; i--) rv2.push([-200 + i * 20, -168 + Math.sin(i * 0.55) * 8 + 9]);
  poly(rv.concat(rv2), { natural: 'water', name: 'Emscher' });
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    const x0 = E[a] + 9, x1 = E[a + 1] - 9, y0 = E[b] + 9, y1 = E[b + 1] - 9; if (b === 0) { continue; }
    if (a === 2 && b === 2) { poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { leisure: 'park', name: 'Stadtgarten' }); continue; }
    const nx = (x1 - x0) > 100 ? 3 : 2, ny = (y1 - y0) > 100 ? 3 : 2, centre = 1 - Math.min(1, Math.hypot((x0 + x1) / 2, (y0 + y1) / 2) / 220);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const w = (x1 - x0) / nx, d = (y1 - y0) / ny, ins = 3 + rnd() * 4, px0 = x0 + i * w + ins, px1 = x0 + (i + 1) * w - ins, py0 = y0 + j * d + ins, py1 = y0 + (j + 1) * d - ins;
      if (rnd() < 0.08) continue; let hh = Math.round(7 + rnd() * 9 + centre * centre * rnd() * 38); if (a === 2 && b === 1 && i === 0 && j === 0) hh = 84; poly([[px0, py0], [px1, py0], [px1, py1], [px0, py1]], { building: 'yes', height: hh });
    }
  }
  return { type: 'FeatureCollection', features: F2 };
};
MP.sample = function () { MP.parse(JSON.stringify(MP.sampleGeoJSON())); return MP.build({}); };
