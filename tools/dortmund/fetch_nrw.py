#!/usr/bin/env python3
"""Lädt die offenen NRW-Geobasisdaten (Datenlizenz Deutschland - Zero - Version 2.0) für ein Kachelgebiet.

    python3 fetch_nrw.py nrw 395-397 5704-5708            # LoD2 + DGM1  (E- und N-Kilometer, UTM32)
    python3 fetch_nrw.py nrw 392-397 5704-5708 --dop      # zusätzlich Luftbilder (DOP10, ca. 30 MB je km²)

Legt nrw/lod2, nrw/dgm1, nrw/dop an. Quelle: https://www.opengeodata.nrw.de/produkte/geobasis/
Dann:  python3 build_east.py nrw  (Gelände+Gebäude anhängen)  und  python3 build_ortho.py nrw/dop tiles 10
"""
import sys, os, re, urllib.request
from concurrent.futures import ThreadPoolExecutor
B = 'https://www.opengeodata.nrw.de/produkte/geobasis/'
out = sys.argv[1]; rng = lambda a: range(int(a.split('-')[0]), int(a.split('-')[-1]) + 1)
E, N = rng(sys.argv[2]), rng(sys.argv[3]); want_dop = '--dop' in sys.argv
jobs = []
for e in E:
    for n in N:
        jobs.append(('lod2', B + '3dg/lod2_gml/lod2_gml/LoD2_32_%d_%d_1_NW.gml' % (e, n)))
        jobs.append(('dgm1', B + 'hm/dgm1_tiff/dgm1_tiff/dgm1_32_%d_%d_1_nw_2025.tif' % (e, n)))
if want_dop:
    idx = urllib.request.urlopen(B + 'lusat/akt/dop/dop_jp2_f10/', timeout=120).read().decode()
    for e in E:
        for n in N:
            c = sorted(re.findall(r'dop10rgbi_32_%d_%d_1_nw_(\d{4})\.jp2' % (e, n), idx))
            if c: jobs.append(('dop', B + 'lusat/akt/dop/dop_jp2_f10/dop10rgbi_32_%d_%d_1_nw_%s.jp2' % (e, n, c[-1])))
            else: print('kein Luftbild für', e, n)


def get(j):
    sub, url = j; d = os.path.join(out, sub); os.makedirs(d, exist_ok=True); fn = os.path.join(d, url.rsplit('/', 1)[1])
    if os.path.exists(fn) and os.path.getsize(fn) > 0: return fn, 'vorhanden'
    try:
        urllib.request.urlretrieve(url, fn + '.part'); os.replace(fn + '.part', fn); return fn, '%.1f MB' % (os.path.getsize(fn) / 1e6)
    except Exception as ex:
        return fn, 'FEHLER %s' % ex


with ThreadPoolExecutor(6) as ex:
    for fn, st in ex.map(get, jobs): print(st.rjust(10), fn)
