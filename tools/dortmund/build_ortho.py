#!/usr/bin/env python3
"""Zerlegt die offenen NRW-Orthofotos (DOP10, JPEG2000, 10 cm) in Kachel-Texturen für den Viewer.

    python3 -I build_ortho.py ../../nrw/dop tiles [Spalten=10]

Je Zelle (512 m): t0 = 512 px (1 m/Pixel, nah), t1 = 256 px (2 m, mittel), t2 = 128 px (4 m, fern) als JPEG.
Bildachse: Zeile 0 = Nordrand der Zelle, Spalte 0 = Westrand (UV im Viewer: u=(x-x0)/512, v=(z-z_süd... siehe index.html).
Quelle: Geobasis NRW, dop10rgbi 2025 (JPEG2000); nur die ersten drei Bänder (R,G,B), das Infrarotband wird verworfen.
"""
import sys, os, glob, time, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
SRC, OUT = sys.argv[1], sys.argv[2].rstrip('/'); NX = int(sys.argv[3]) if len(sys.argv) > 3 else 10; NZ = 8; CS = 512
E0, N0 = 392192, 5704704
t0 = time.time()
files = {}
for f in glob.glob(SRC + '/dop10rgbi_32_*_nw_*.jp2'):
    p = os.path.basename(f).split('_'); files[(int(p[2]), int(p[3]))] = f
cols = sorted({e for e, n in files}); rows = sorted({n for e, n in files})
eW, nN = cols[0] * 1000, (rows[-1] + 1) * 1000
M = np.zeros(((rows[-1] - rows[0] + 1) * 1000, (cols[-1] - cols[0] + 1) * 1000, 3), np.uint8)
for (e, n), f in sorted(files.items()):
    im = Image.open(f); im.reduce = 3                      # 1/8 der Auflösung dekodieren: 0,8 m/Pixel, schnell
    im.load(); im = im.convert('RGB').resize((1000, 1000), Image.LANCZOS)
    r0 = nN - (n + 1) * 1000; c0 = e * 1000 - eW
    M[r0:r0 + 1000, c0:c0 + 1000] = np.asarray(im)
    print('[%5.1fs] %s' % (time.time() - t0, os.path.basename(f)), flush=True)
tot = {0: 0, 1: 0, 2: 0}
for cz in range(NZ):
    for cx in range(NX):
        Ec, Nt = E0 + cx * CS, N0 + (cz + 1) * CS          # Westrand, Nordrand der Zelle
        r0, c0 = nN - Nt, Ec - eW
        if r0 < 0 or c0 < 0 or r0 + CS > M.shape[0] or c0 + CS > M.shape[1]: print('Zelle außerhalb des Mosaiks', cx, cz); continue
        crop = Image.fromarray(M[r0:r0 + CS, c0:c0 + CS])
        for lvl, (px, q) in enumerate(((512, 80), (256, 82), (128, 85))):
            im = crop if px == CS else crop.resize((px, px), Image.LANCZOS)
            fn = '%s/t%d_%d_%d.jpg' % (OUT, lvl, cx, cz); im.save(fn, quality=q, optimize=True, progressive=False); tot[lvl] += os.path.getsize(fn)
print('Texturen: t0 %.1f MB, t1 %.1f MB, t2 %.1f MB' % tuple(tot[k] / 1e6 for k in (0, 1, 2)), '| %.1f s' % (time.time() - t0))
