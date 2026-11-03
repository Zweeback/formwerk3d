#!/usr/bin/env python3
"""Baut aus dlm_area.json (fetch_dlm.py) die Straßen-, Weg- und Wasserdaten des Viewers:

    python3 -I build_roads.py dlm_area.json tiles          # tiles enthält _H4.npy, _isb2.npy (build_tiles.py) und bekommt roads.json

roads.json
  nodes   [x, z, x, z, ...]                        Knoten des Straßennetzes (Endpunkte, auf 0,5 m zusammengefasst)
  edges   [{c, w, n, a, b, f, p:[x,z,...]}]        Straßenstücke: Klasse (0 Bundes-, 1 Landes-, 2 Kreis-, 3 Gemeindestraße, 4 sonstige),
                                                   Fahrbahnbreite m, Fahrstreifen, Knoten a→b, Flags (1 getrennte Fahrbahn, 2 Fußgängerzone, 4 unter Gebäude/Tunnel), Linienzug (0,1 m)
  paths   [{w, p:[...]}]                           Wege und Pfade (für Passanten)
  water   [{name, y, p:[x,z,...], i:[...]}]        Wasserflächen, trianguliert, Höhe der Wasseroberfläche
Koordinaten wie im Viewer: x = Ost − E0, z = −(Nord − N0).
"""
import sys, json, math, numpy as np
from scipy import ndimage as ndi
import mapbox_earcut as earcut
A = json.load(open(sys.argv[1])); D = sys.argv[2].rstrip('/')
H = np.load(D + '/_H4.npy'); isb = np.load(D + '/_isb2.npy'); GH, GW = H.shape; BH, BW = isb.shape
CLS = {1301: 0, 1303: 0, 1305: 1, 1306: 2, 1307: 3}
DEF_W = {0: 9.0, 1: 7.5, 2: 6.5, 3: 6.0, 4: 5.0}                      # Standardbreiten, wenn das DLM keine Fahrbahnbreite (BRF) hat
known = {}
for r in A['roads']:
    if r['w'] > 0: known.setdefault(CLS.get(r['cls'], 4), []).append(r['w'])
print('Fahrbahnbreite aus dem DLM (Anzahl, Median m) je Klasse:', {k: (len(v), float(np.median(v))) for k, v in sorted(known.items())})


def inb(x, z):                     # Gebäude-Bitmap 2 m
    i = int(round(-z / 2)); j = int(round(x / 2)); return 0 <= i < BH and 0 <= j < BW and bool(isb[i, j])


def resample(p, step=2.0):
    p = np.asarray(p, float); seg = np.hypot(*(p[1:] - p[:-1]).T); L = np.concatenate([[0], np.cumsum(seg)]); n = max(2, int(L[-1] / step) + 1); s = np.linspace(0, L[-1], n)
    return np.stack([np.interp(s, L, p[:, 0]), np.interp(s, L, p[:, 1])], 1)


def split_inside(p, minrun=10.0):
    """Teilt einen Linienzug dort, wo er ≥ minrun m am Stück im Gebäudeumriss verläuft (Unterführung/Tunnel). → [(Punkte, innen?)]"""
    q = resample(p); ins = np.array([inb(x, z) for x, z in q]);
    if not ins.any(): return [(np.asarray(p, float), False)]
    runs = []; k = 0
    while k < len(q):
        j = k
        while j + 1 < len(q) and ins[j + 1] == ins[k]: j += 1
        runs.append([k, j, bool(ins[k])]); k = j + 1
    for r in runs:                                                           # kurze Innen-Läufe sind Ungenauigkeit, keine Unterführung
        if r[2] and (r[1] - r[0] + 1) * 2.0 < minrun: r[2] = False
    merged = []
    for r in runs:
        if merged and merged[-1][2] == r[2]: merged[-1][1] = r[1]
        else: merged.append(r)
    if len(merged) == 1 and not merged[0][2]: return [(np.asarray(p, float), False)]
    out = []
    for a, b, f in merged:
        a2 = max(0, a - (0 if a == 0 else 1)); seg = q[a2:b + 2] if b + 1 < len(q) else q[a2:b + 1]
        if len(seg) >= 2: out.append((seg, f))
    return out


nodes = []; nid = {}
def node(x, z):
    k = (round(x / 0.5), round(z / 0.5))
    for dk in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        q = (k[0] + dk[0], k[1] + dk[1])
        if q in nid: return nid[q]
    nid[k] = len(nodes); nodes.append((x, z)); return nid[k]


edges = []; tun_len = 0.0; nsplit = 0
for r in A['roads']:
    c = CLS.get(r['cls'], 4); w = r['w'] if r['w'] > 0 else DEF_W[c]
    if r['lanes'] >= 3 and not r['w']: w = max(w, 3.2 * r['lanes'])
    fl = (1 if r['fb'] else 0) | (2 if r['fkt'] == '1808' else 0)
    for pts, inside in split_inside(r['pts']):
        if len(pts) < 2: continue
        p = np.round(np.asarray(pts, float), 1);
        if inside: tun_len += float(np.hypot(*(p[1:] - p[:-1]).T).sum())
        a = node(*p[0]); b = node(*p[-1]); nsplit += 1
        edges.append({'c': c, 'w': round(float(w), 1), 'n': r['lanes'] or 2, 'a': a, 'b': b, 'f': fl | (4 if inside else 0), 'p': [float(v) for v in p.ravel()]})
tot = sum(float(np.hypot(*(np.array(e['p']).reshape(-1, 2)[1:] - np.array(e['p']).reshape(-1, 2)[:-1]).T).sum()) for e in edges)
print('Straßenstücke:', len(edges), '| Knoten:', len(nodes), '| Länge %.1f km, davon unter Gebäuden %.2f km' % (tot / 1000, tun_len / 1000))
deg = np.bincount([e['a'] for e in edges] + [e['b'] for e in edges], minlength=len(nodes)); print('Knotengrad:', dict(zip(*np.unique(deg, return_counts=True))))

paths = [{'w': p['w'] or 3.0, 'p': [round(v, 1) for v in np.asarray(p['pts'], float).ravel()]} for p in A['paths']]
print('Wege:', len(paths))

water = []
for wa in A['water']:
    rings = [np.asarray(r, float) for r in wa['rings']]
    # größte Fläche ist die Außenkante, die übrigen Löcher (Shape: Außenringe im Uhrzeigersinn; hier genügt: Ring mit größtem Betrag = Außenring)
    def area(r): return 0.5 * float((r[:-1, 0] * r[1:, 1] - r[1:, 0] * r[:-1, 1]).sum())
    rings.sort(key=lambda r: -abs(area(r))); outer = [rings[0]]; holes = rings[1:]
    allr = outer + holes; verts = np.concatenate([r[:-1] if np.allclose(r[0], r[-1]) else r for r in allr]); ends = np.cumsum([len(r[:-1]) if np.allclose(r[0], r[-1]) else len(r) for r in allr])
    tri = earcut.triangulate_float64(verts, ends.astype(np.uint32)).reshape(-1, 3)
    # Wasserstand: Median der Geländehöhe in der Fläche (DGM1 enthält bei Seen die Wasseroberfläche)
    xs = np.arange(0, GW) * 4.0; zs = -np.arange(0, GH) * 4.0
    from matplotlib.path import Path
    msk = Path(rings[0]).contains_points(np.stack(np.meshgrid(xs, zs), -1).reshape(-1, 2)).reshape(GH, GW)
    for h in holes: msk &= ~Path(h).contains_points(np.stack(np.meshgrid(xs, zs), -1).reshape(-1, 2)).reshape(GH, GW)
    hv = H[msk]
    y = float(np.median(hv)) if len(hv) else float('nan')
    info = (len(hv), round(float(np.percentile(hv, 5)), 2), round(y, 2), round(float(np.percentile(hv, 95)), 2)) if len(hv) else None
    print('Wasser %-20s %6.0f m² %d Dreiecke, Gelände darin (n,p5,median,p95) %s' % (wa['name'] or '(ohne Name)', abs(area(rings[0])), len(tri), info))
    if len(hv) < 6 or abs(area(rings[0])) < 150 or (np.percentile(hv, 95) - np.percentile(hv, 5)) > 1.0: continue   # Gartenteiche und Becken ohne ebene Wasseroberfläche im DGM weglassen
    water.append({'name': wa['name'], 'y': round(y, 2), 'p': [round(float(v), 1) for v in verts.ravel()], 'i': [int(v) for v in tri.ravel()]})

out = {'v': 1, 'nodes': [round(float(v), 1) for n in nodes for v in n], 'edges': edges, 'paths': paths, 'water': water,
       'quelle': 'Geobasis NRW, Basis-DLM (Straßen- und Wegeachsen, stehende Gewässer), Datenlizenz Deutschland – Zero – Version 2.0'}
json.dump(out, open(D + '/roads.json', 'w'), separators=(',', ':'))
import os; print('roads.json %.2f MB' % (os.path.getsize(D + '/roads.json') / 1e6))
