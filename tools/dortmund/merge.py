import json, sys, time, numpy as np
sys.path.insert(0, '.')
from glbio import read_glb, write_glb
ROOT = sys.argv[1]; OUT = sys.argv[2]
idx = json.load(open(ROOT + '/index.json')); cells = idx['cells']
t0 = time.time(); T = []; B = []; stats = []; tcell = {}
for c in cells:
    dx, dy, dz = c['offset']
    p, t = read_glb(ROOT + '/' + c['terrain_render']); p = p + np.array([dx, dy, dz], np.float32); T.append((p, t)); tcell[c['id']] = (p, t)
    nb = 0
    for b in c['buildings']:
        bp, bt = read_glb(ROOT + '/' + b); bp = bp + np.array([dx, dy, dz], np.float32); B.append((bp, bt)); nb += len(bt)
    stats.append((c['id'], len(t), nb))
def cat(L):
    base = 0; P = []; I = []
    for p, t in L: P.append(p); I.append(t + base); base += len(p)
    return np.concatenate(P), np.concatenate(I)
tp, tt = cat(T); bp, bt = cat(B)
print('Gelände', len(tt), 'Dreiecke,', len(tp), 'Punkte | Gebäude', len(bt), 'Dreiecke,', len(bp), 'Punkte |', round(time.time() - t0, 1), 's')
print('Ausdehnung Gelände x', tp[:, 0].min(), tp[:, 0].max(), 'z', tp[:, 2].min(), tp[:, 2].max(), 'Höhe', tp[:, 1].min(), tp[:, 1].max())
print('Ausdehnung Gebäude x', bp[:, 0].min(), bp[:, 0].max(), 'z', bp[:, 2].min(), bp[:, 2].max(), 'Höhe', bp[:, 1].min(), bp[:, 1].max())
# Nahtprüfung: Höhen an Zellgrenzen (Ost-Nachbar, Nord-Nachbar)
byid = {c['id']: c for c in cells}; maxd = 0; n = 0; worst = None
def edge(p, axis, val):
    m = np.isclose(p[:, axis], val, atol=0.01); q = p[m]; o = np.argsort(q[:, 2 if axis == 0 else 0]); return q[o]
for c in cells:
    e = c['bbox'][0] + 512; nn = c['bbox'][1]; nid = 'e%d_n%d' % (e, nn)
    if nid in tcell:
        a = edge(tcell[c['id']][0], 0, c['offset'][0] + 512); b = edge(tcell[nid][0], 0, byid[nid]['offset'][0])
        if len(a) == len(b) and len(a): d = np.abs(a[:, 1] - b[:, 1]).max(); n += 1
        else: d = -1
        if d > maxd: maxd = d; worst = (c['id'], nid, 'Ost')
    nid = 'e%d_n%d' % (c['bbox'][0], c['bbox'][1] + 512)
    if nid in tcell:
        a = edge(tcell[c['id']][0], 2, c['offset'][2] - 512); b = edge(tcell[nid][0], 2, byid[nid]['offset'][2])
        if len(a) == len(b) and len(a): d = np.abs(a[:, 1] - b[:, 1]).max(); n += 1
        else: d = -1
        if d > maxd: maxd = d; worst = (c['id'], nid, 'Nord')
print('Nahtprüfung: %d Nachbarpaare, größter Höhensprung an Zellgrenzen: %.3f m' % (n, maxd), worst)
np.savez_compressed(OUT + '/merged.npz', tp=tp, tt=tt, bp=bp, bt=bt)
# Färbung: Gelände nach Höhe, Gebäude hell
def ramp(h):
    t = np.clip((h - h.min()) / (h.max() - h.min()), 0, 1)[:, None]; lo = np.array([0.26, 0.45, 0.22]); hi = np.array([0.78, 0.72, 0.52]); return lo + (hi - lo) * t
tc = ramp(tp[:, 1]); bc = np.tile(np.array([0.82, 0.80, 0.77]), (len(bp), 1))
P = np.concatenate([tp, bp]); I = np.concatenate([tt, bt + len(tp)]); C = np.concatenate([tc, bc])
sz = write_glb(OUT + '/Dortmund_Hoerde_komplett.glb', P, I, C, 'Dortmund Hoerde')
print('Dortmund_Hoerde_komplett.glb', round(sz / 1e6, 1), 'MB,', len(I), 'Dreiecke')
json.dump(stats, open(OUT + '/cellstats.json', 'w'))
