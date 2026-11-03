#!/usr/bin/env python3
"""Holt Straßen, Wege, Bahn, Plätze und stehende Gewässer aus dem Basis-DLM NRW für das Kachelgebiet.

    python3 -I fetch_dlm.py dlm_cache dlm_area.json [E0 N0 E1 N1]

Quelle: Geobasis NRW, Basis-DLM (Shape, EPSG:25832), Datenlizenz Deutschland – Zero – Version 2.0 (vor Verkauf auf der Datensatzseite prüfen):
https://www.opengeodata.nrw.de/produkte/geobasis/lm/akt/basis-dlm/basis-dlm_EPSG25832_Shape.zip

Das Zip hat 4,7 GB, ist aber unkomprimiert abgelegt. Per HTTP-Bereichsabruf (Range) wird nur geholt, was gebraucht wird:
  - das Zip-Inhaltsverzeichnis (wenige kB),
  - .shp/.shx der Schichten (zusammen ca. 400 MB, werden nach dem Filtern nicht mehr gebraucht und können gelöscht werden),
  - aus den .dbf nur die Zeilen der Objekte im Gebiet (Bereichsabrufe, wenige MB).
Ergebnis: dlm_area.json (ca. 1–2 MB) mit Koordinaten schon im Viewer-System x = Ost − E0, z = −(Nord − N0).
"""
import sys, os, io, json, struct, zipfile, urllib.request
import numpy as np
from concurrent.futures import ThreadPoolExecutor
URL = 'https://www.opengeodata.nrw.de/produkte/geobasis/lm/akt/basis-dlm/basis-dlm_EPSG25832_Shape.zip'
CACHE = sys.argv[1] if len(sys.argv) > 1 else 'dlm_cache'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'dlm_area.json'
E0, N0, E1, N1 = [int(v) for v in sys.argv[3:7]] if len(sys.argv) >= 7 else (392192, 5704704, 397312, 5708800)
PAD = 60
os.makedirs(CACHE, exist_ok=True)


def rng(a, b):
    r = urllib.request.Request(URL, headers={'Range': 'bytes=%d-%d' % (a, b - 1)})
    return urllib.request.urlopen(r, timeout=600).read()


class HTTPRangeFile(io.RawIOBase):
    def __init__(s):
        r = urllib.request.Request(URL, method='HEAD'); s.size = int(urllib.request.urlopen(r, timeout=60).headers['Content-Length']); s.pos = 0
    def seekable(s): return True
    def readable(s): return True
    def tell(s): return s.pos
    def seek(s, off, wh=0):
        s.pos = off if wh == 0 else s.pos + off if wh == 1 else s.size + off; return s.pos
    def read(s, n=-1):
        if n < 0 or s.pos + n > s.size: n = s.size - s.pos
        if n <= 0: return b''
        d = rng(s.pos, s.pos + n); s.pos += len(d); return d
    def readinto(s, b):
        d = s.read(len(b)); b[:len(d)] = d; return len(d)


LAYERS = ['ver01_l', 'ver02_l', 'ver03_l', 'ver01_f', 'gew01_f']   # Straße, Weg/Pfad, Bahn, Straßen-/Platzfläche, stehendes Gewässer
z = zipfile.ZipFile(HTTPRangeFile())
M = {i.filename.rsplit('/', 1)[-1]: i for i in z.infolist()}
for i in M.values():
    assert i.compress_type == 0, 'Zip ist komprimiert, Bereichsabruf nicht möglich'


def data_start(name):
    off = M[name].header_offset; h = rng(off, off + 30); n, m = struct.unpack('<HH', h[26:30]); return off + 30 + n + m


def fetch_file(name):
    fn = os.path.join(CACHE, name)
    if os.path.exists(fn) and os.path.getsize(fn) == M[name].file_size: return fn
    s = data_start(name); e = s + M[name].file_size
    with open(fn + '.part', 'wb') as f:
        p = s
        while p < e:
            q = min(e, p + 32 * 1024 * 1024); f.write(rng(p, q)); p = q
    os.replace(fn + '.part', fn); return fn


def select(name):
    """Indizes der Objekte, deren Hüllrechteck das Gebiet trifft (aus den Köpfen der .shp-Sätze, vektorisiert)."""
    shx = np.fromfile(os.path.join(CACHE, name + '.shx'), dtype='>i4')[25:]; off = shx[0::2].astype(np.int64) * 2
    shp = np.memmap(os.path.join(CACHE, name + '.shp'), dtype=np.uint8, mode='r')
    raw = np.asarray(shp[off[:, None] + 8 + np.arange(36)[None, :]]); typ = raw[:, :4].copy().view('<i4')[:, 0]; box = raw[:, 4:36].copy().view('<f8')
    ok = (typ != 0) & (box[:, 0] <= E1 + PAD) & (box[:, 2] >= E0 - PAD) & (box[:, 1] <= N1 + PAD) & (box[:, 3] >= N0 - PAD)
    return np.nonzero(ok)[0], off


def dbf_rows(name, sel):
    s = data_start(name + '.dbf'); h = rng(s, s + 32); nrec, hlen, rlen = struct.unpack('<IHH', h[4:12]); raw = rng(s, s + hlen)
    fields = []; p = 32
    while raw[p] != 0x0D:
        fields.append((raw[p:p + 11].split(b'\0')[0].decode('latin1'), raw[p + 16])); p += 32
    groups = []; cur = [int(sel[0])]
    for a in sel[1:]:
        a = int(a)
        if (a - cur[-1]) * rlen < 200000: cur.append(a)
        else: groups.append(cur); cur = [a]
    groups.append(cur)
    def fetch(g):
        a, b = g[0], g[-1]; blob = rng(s + hlen + a * rlen, s + hlen + (b + 1) * rlen)
        return [(i, blob[(i - a) * rlen:(i - a + 1) * rlen]) for i in g]
    got = {}
    with ThreadPoolExecutor(12) as ex:
        for res in ex.map(fetch, groups):
            for i, r in res: got[i] = r
    rows = []
    for i in sel:
        r = got[int(i)]; p = 1; d = {}
        for fn, ln in fields: d[fn] = r[p:p + ln].decode('utf-8', 'replace').strip(); p += ln
        rows.append(d)
    return rows


def geometry(name, sel, off):
    """Linien / Ringe aus der .shp (Typ 3 = PolyLine, 5 = Polygon), Viewer-Koordinaten."""
    shp = open(os.path.join(CACHE, name + '.shp'), 'rb'); out = []
    for i in sel:
        shp.seek(int(off[i]) + 8); rec = shp.read(44)                          # Typ, Box, nParts, nPoints
        typ, = struct.unpack('<i', rec[:4]); npart, npts = struct.unpack('<ii', rec[36:44])
        parts = np.frombuffer(shp.read(4 * npart), '<i4'); pts = np.frombuffer(shp.read(16 * npts), '<f8').reshape(-1, 2)
        x = pts[:, 0] - E0; zz = -(pts[:, 1] - N0); xy = np.stack([x, zz], 1)
        bounds = list(parts) + [npts]; out.append([np.round(xy[bounds[k]:bounds[k + 1]], 2).tolist() for k in range(npart)])
    return out


# Schichten laden
with ThreadPoolExecutor(5) as ex:
    list(ex.map(fetch_file, [l + e for l in LAYERS for e in ('.shp', '.shx')]))
res = {'origin': [E0, N0], 'bbox': [E0, N0, E1, N1], 'quelle': 'Geobasis NRW, Basis-DLM, Datenlizenz Deutschland – Zero – Version 2.0', 'roads': [], 'paths': [], 'rail': [], 'areas': [], 'water': []}
for lay in LAYERS:
    sel, off = select(lay); rows = dbf_rows(lay, sel); geo = geometry(lay, sel, off); print(lay, len(sel), 'Objekte im Gebiet')
    for r, g in zip(rows, geo):
        if lay == 'ver01_l':
            if r['OBJART'] == '42003' and r['FTR'] == '2000': continue          # Straßenachse bei getrennten Fahrbahnen: die Fahrbahnachsen (42005) zeichnen
            res['roads'].append({'cls': int(r['WDM'] or 0), 'fb': r['OBJART'] == '42005', 'w': float(r['BRF']) if float(r['BRF']) > 0 else 0, 'lanes': int(r['FSZ']) if int(r['FSZ']) > 0 else 0,
                                 'fkt': r['FKT'], 'ref': r['BEZ'], 'name': r['NAM'], 'pts': g[0] if len(g) == 1 else sum(g, [])})
        elif lay == 'ver02_l':
            res['paths'].append({'type': r['OBJART'], 'art': r['ART'], 'fkt': r['FKT'], 'w': float(r['BRV']) if float(r['BRV']) > 0 else 0, 'name': r['NAM'], 'pts': g[0]})
        elif lay == 'ver03_l':
            res['rail'].append({'type': r['OBJART'], 'bkt': r['BKT'], 'pts': g[0]})
        elif lay == 'ver01_f':
            res['areas'].append({'type': r['OBJART'], 'fkt': r['FKT'], 'name': r['NAM'], 'rings': g})
        elif lay == 'gew01_f':
            res['water'].append({'name': r['NAM'], 'rings': g})
json.dump(res, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('geschrieben:', OUT, '%.2f MB' % (os.path.getsize(OUT) / 1e6), {k: len(v) for k, v in res.items() if isinstance(v, list)})
