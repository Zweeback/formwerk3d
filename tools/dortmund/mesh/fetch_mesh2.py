#!/usr/bin/env python3
"""NRW-3D-Mesh -> ultraleichte Viewer-Kacheln (.msh = vereinfachtes Netz + WebP-Textur in EINER Datei).

  python3 -I fetch_mesh2.py index.pkl nodes.pkl depth.pkl outdir E0 N0 E1 N1 spec [spec ...]

  spec = tiefe:fehler_m:texdiv:webpq, z. B. 20:0.6:4:50 19:1.2:4:50 18:2.4:4:50
  tiefe     Detailstufe im Knotenbaum (20 = feinste)
  fehler_m  größter zulässiger Vereinfachungsfehler in Metern (0.2 = scharf, 0.5 = grob)
  texdiv    Textur-Verkleinerung (1 = Original, 2 = halbe Kantenlänge, 4 = Viertel)
  webpq     WebP-Qualität 1..100
Dateiformat .msh (MSH3, little endian):
  'MSH3' u32 nv, u32 nt, 6 x f64 (lo xyz, scale xyz), u32 texfmt (1 WebP, 2 AVIF), u32 texlen, u32 zlen
  zlen Bytes rohes Deflate (Ebene 9) von: Position (3 Ebenen), UV (2 Ebenen), Index (1 Ebene); je Ebene Delta zum Vorgänger (mod 65536), erst alle niederen, dann alle hohen Bytes
  texlen Bytes Textur
Die Eckpunkte sind in Viewer-Koordinaten (x = Ost-392192, y = Höhe-100, z = -(Nord-5704704)); position = lo + scale * u16.
Quelle: Geobasis NRW, 3D-Mesh (Datenlizenz Deutschland - Zero - Version 2.0).
"""
import sys, os, io, json, pickle, struct, zlib, numpy as np
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slpk_lib import Slpk
import meshopt_c as mc
IDX, NOD, DEP, OUT = sys.argv[1:5]; E0, N0, E1, N1 = [float(v) for v in sys.argv[5:9]]
SPEC = {}
for a in sys.argv[9:]:
    d, e, t, q = a.split(':'); SPEC[int(d)] = (float(e), float(t), int(q))
DEPTHS = list(SPEC)
BOXES = [[float(v) for v in b.split(',')] for b in os.environ['BOXES'].split(';')] if os.environ.get('BOXES') else [[E0, N0, E1, N1]]   # mehrere Gebiete: BOXES='E0,N0,E1,N1;E0,N0,E1,N1'
UVW = float(os.environ.get('UVW', 1.5)); TEXFMT = os.environ.get('TEXFMT', 'avif')
OX, OZ, OH = 392192.0, 5704704.0, 100.0
os.makedirs(OUT, exist_ok=True); S = Slpk(IDX); N = pickle.load(open(NOD, 'rb')); D = pickle.load(open(DEP, 'rb'))
def aabb(n):
    x, y, z, w = n['q']; R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]); return np.abs(R) @ np.array(n['h'])
sel = []
for i, n in N.items():
    if n['geo'] is None or D[i] not in DEPTHS: continue
    hx, hy, _ = aabb(n)
    if not any(not (n['c'][0] + hx < b[0] or n['c'][0] - hx > b[2] or n['c'][1] + hy < b[1] or n['c'][1] - hy > b[3]) for b in BOXES): continue
    sel.append(i)
print('Knoten:', len(sel), {d: sum(1 for i in sel if D[i] == d) for d in DEPTHS}, flush=True)
def conv(i):
    n = N[i]; geo, tex = n['geo'], n['tex']; fm = os.path.join(OUT, '%d.msh' % geo); ERR, TD, WQ = SPEC[D[i]]
    if os.path.exists(fm) and os.path.exists(fm + '.json'): return json.load(open(fm + '.json'))
    g = S.read('nodes/%d/geometries/0.bin.gz' % geo); vc, fc = struct.unpack('<II', g[:8])
    pos = np.frombuffer(g, '<f4', vc * 3, 8).reshape(-1, 3).astype(np.float64); uv = np.frombuffer(g, '<f4', vc * 2, 8 + vc * 12).reshape(-1, 2).astype(np.float32)
    w = np.empty_like(pos); w[:, 0] = n['c'][0] + pos[:, 0] - OX; w[:, 1] = n['c'][2] + pos[:, 2] - OH; w[:, 2] = -((n['c'][1] + pos[:, 1]) - OZ)
    w32 = w.astype(np.float32)
    # verschweißen über (Position, UV), dann vereinfachen
    key = np.concatenate([np.round(w * 1000).astype(np.int64), np.round(uv * 20000).astype(np.int64)], 1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1).astype(np.uint32)
    P = np.ascontiguousarray(w32[first]); T = np.ascontiguousarray(uv[first]); idx = inv.reshape(-1, 3)
    ok = (idx[:, 0] != idx[:, 1]) & (idx[:, 1] != idx[:, 2]) & (idx[:, 0] != idx[:, 2]); idx = np.ascontiguousarray(idx[ok].ravel().astype(np.uint32))
    nt0 = len(idx) // 3
    sidx, errv = mc.simplify(idx, P, T, [UVW, UVW], max(36, int(len(idx) * 0.03)), ERR)
    used, remap = np.unique(sidx, return_inverse=True); P2 = P[used]; T2 = T[used]; idx2 = remap.astype(np.uint32)
    lo = P2.min(0).astype(np.float64); hi = P2.max(0).astype(np.float64); sc = np.maximum(hi - lo, 1e-3) / 65535.0
    q = np.round((P2 - lo) / sc).astype(np.uint16); uq = np.clip(np.round(T2 * 65535.0), 0, 65535).astype(np.uint16)
    nv = len(P2); nt = len(idx2) // 3
    assert nv < 65536, 'zu viele Eckpunkte'
    def plane(a):  # a: (n,) uint16 -> Delta mod 2^16, Bytes niedere dann hohe
        d = np.diff(a.astype(np.int64), prepend=0) & 0xFFFF
        return (d & 255).astype(np.uint8).tobytes() + (d >> 8).astype(np.uint8).tobytes()
    raw = b''.join([plane(q[:, c]) for c in range(3)] + [plane(uq[:, c]) for c in range(2)] + [plane(idx2.astype(np.uint16))])
    co = zlib.compressobj(9, zlib.DEFLATED, -15); z = co.compress(raw) + co.flush()
    im = Image.open(io.BytesIO(S.raw('nodes/%d/textures/0.jpg' % tex))).convert('RGB')
    if TD != 1: im = im.resize((max(8, round(im.width / TD)), max(8, round(im.height / TD))), Image.LANCZOS)
    bio = io.BytesIO()
    if TEXFMT == 'avif': im.save(bio, 'AVIF', quality=WQ, speed=6); tf = 2
    else: im.save(bio, 'WEBP', quality=WQ, method=4); tf = 1
    tb = bio.getvalue()
    with open(fm, 'wb') as f:
        f.write(struct.pack('<4sII', b'MSH3', nv, nt)); f.write(struct.pack('<6d', *lo, *sc)); f.write(struct.pack('<III', tf, len(tb), len(z))); f.write(z); f.write(tb)
    box = [round(float(v), 2) for v in list(lo) + list(hi)]
    r = {'id': i, 'd': D[i], 'p': n['parent'], 'ch': n['children'], 'f': '%d.msh' % geo, 'box': box, 'nv': nv, 'nt': nt, 'nt0': nt0, 'err': round(float(errv), 3), 'tex': list(im.size), 'bytes': os.path.getsize(fm)}
    json.dump(r, open(fm + '.json', 'w')); return r
res = []
with ThreadPoolExecutor(int(os.environ.get('THREADS', 24))) as ex:
    for k, r in enumerate(ex.map(conv, sel)):
        res.append(r)
        if k % 100 == 0: print(k, '/', len(sel), flush=True)
mf = os.path.join(OUT, 'manifest.json')
old = json.load(open(mf))['nodes'] if os.path.exists(mf) else []; seen = {x['id'] for x in res}; res = res + [x for x in old if x['id'] not in seen]
json.dump({'v': 3, 'origin': [OX, OZ, OH], 'nodes': res, 'quelle': 'Geobasis NRW, 3D-Mesh, Datenlizenz Deutschland - Zero - Version 2.0'}, open(mf, 'w'), separators=(',', ':'))
tb = sum(x['bytes'] for x in res); nt0 = sum(x['nt0'] for x in res); nt = sum(x['nt'] for x in res)
print('fertig: %d Knoten, %.2f MB, Dreiecke %d -> %d (%.1f %%), mittlerer Fehler %.2f m' % (len(res), tb / 1e6, nt0, nt, 100 * nt / nt0, np.mean([x['err'] for x in res])))
