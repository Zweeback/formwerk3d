#!/usr/bin/env python3
"""Hängt Gelände (DGM1) und Gebäude (LoD2) aus den offenen NRW-Daten östlich an die 48 Zellen an
(Richtung Hörde, Phoenix-See) und schreibt out/merged_ext.npz im selben Format wie out/merged.npz.

    python3 -I build_east.py ../../nrw  [Spalten=4]

Voraussetzung: nrw/lod2/LoD2_32_{E}_{N}_1_NW.gml und nrw/dgm1/dgm1_32_{E}_{N}_1_nw_2025.tif für E=395..397, N=5704..5708
(von https://www.opengeodata.nrw.de/produkte/geobasis/, Datenlizenz Deutschland - Zero - Version 2.0).
Die Naht liegt bei x = 3072 (E = 395264): links Altbestand, rechts neu; Gelände wird an der Naht gemittelt.
"""
import sys, os, glob, time, numpy as np, tifffile
from scipy.ndimage import map_coordinates
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import citygml_lod2 as G

SRC = sys.argv[1]; EXTRA = int(sys.argv[2]) if len(sys.argv) > 2 else 4
E0, N0 = G.E0, G.N0; CS = 512.0; NZ = 8
X0 = 6 * CS; X1 = (6 + EXTRA) * CS                      # neue Spalten: x 3072 .. 3072+512*EXTRA
t0 = time.time()
def lap(s): print('[%5.1fs] %s' % (time.time() - t0, s), flush=True)

# ---- Gelände: Mosaik der 1-km-Kacheln (E 395..397, N 5704..5708), 1 m
cols = sorted({int(os.path.basename(f).split('_')[2]) for f in glob.glob(SRC + '/dgm1/*.tif')})
rows = sorted({int(os.path.basename(f).split('_')[3]) for f in glob.glob(SRC + '/dgm1/*.tif')})
eW, nN = min(cols) * 1000, (max(rows) + 1) * 1000
M = np.full(((max(rows) - min(rows) + 1) * 1000, (max(cols) - min(cols) + 1) * 1000), np.nan, np.float32)
for f in glob.glob(SRC + '/dgm1/*.tif'):
    p = os.path.basename(f).split('_'); e, n = int(p[2]), int(p[3])
    a = tifffile.imread(f).astype(np.float32); a[a < -999] = np.nan
    r0 = (nN - (n + 1) * 1000); c0 = e * 1000 - eW
    M[r0:r0 + 1000, c0:c0 + 1000] = a
lap('DGM1-Mosaik %s, %.1f %% Lücken' % (M.shape, 100 * np.isnan(M).mean()))
GW0 = 6 * 128 + 1; GH = NZ * 128 + 1; GW1 = (6 + EXTRA) * 128 + 1
jj, ii = np.meshgrid(np.arange(GW0 - 1, GW1), np.arange(GH))   # ab Naht-Spalte 768 (mitteln mit Altbestand)
E = E0 + jj * 4.0; N = N0 + ii * 4.0
vals = map_coordinates(M, [nN - N - 0.5, E - eW - 0.5], order=1, mode='nearest', cval=np.nan)
assert not np.isnan(vals).any(), 'Lücken im Gelände'
tp_e = np.stack([jj * 4.0, vals - 100.0, -ii * 4.0], -1).reshape(-1, 3)
lap('Gelände Ost: %d Knoten, Höhe %.1f..%.1f m ü. NHN' % (len(tp_e), vals.min(), vals.max()))
# Probe gegen Altbestand im Überlappungsstreifen E 395000..395264 (x 2808..3072)
try:
    H4 = np.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tiles', '_H4.npy'))
    jo, io = np.meshgrid(np.arange(702, 769), np.arange(GH)); Eo = E0 + jo * 4.0; No = N0 + io * 4.0
    vo = map_coordinates(M, [nN - No - 0.5, Eo - eW - 0.5], order=1, mode='nearest')
    dd = (vo - 100.0) - H4[io, jo]
    lap('Gelände-Probe im Überlappungsstreifen: Ø %.3f m, RMS %.3f m, 95 %%-Quantil |Δ| %.2f m' % (dd.mean(), np.sqrt((dd ** 2).mean()), np.quantile(np.abs(dd), .95)))
except Exception as ex:
    print('Probe übersprungen:', ex)

# ---- Gebäude
Vs, Ts, base = [], [], 0
for f in sorted(glob.glob(SRC + '/lod2/*.gml')):
    v, t, own, cen = G.read_tile(f)
    if not len(t): continue
    Vs.append(v); Ts.append(t + base); base += len(v)
    lap('%s: %d Gebäude, %d Dreiecke' % (os.path.basename(f), len(cen), len(t)))
V = np.vstack(Vs); T = np.vstack(Ts)
ctr = V[T].mean(1)
k = (ctr[:, 0] >= X0) & (ctr[:, 0] < X1 - 4) & (ctr[:, 2] <= 0) & (ctr[:, 2] > -(GH * 4 - 4))
T = T[k][:, [0, 2, 1]]                                   # Umlaufsinn wie im Altbestand
used, inv = np.unique(T, return_inverse=True); bp_e = V[used]; bt_e = inv.reshape(-1, 3)
lap('Gebäude Ost: %d Dreiecke (x %.0f..%.0f)' % (len(bt_e), X0, X1))

d = np.load('out/merged.npz')
tp = np.concatenate([d['tp'], tp_e]); tt = d['tt']
bp = np.concatenate([d['bp'], bp_e]); bt = np.concatenate([d['bt'], bt_e + len(d['bp'])])
np.savez('out/merged_ext.npz', tp=tp.astype(np.float32), tt=tt, bp=bp.astype(np.float32), bt=bt.astype(bt.dtype))
lap('geschrieben: out/merged_ext.npz (Gelände %d Punkte, Gebäude %d Dreiecke)' % (len(tp), len(bt)))
