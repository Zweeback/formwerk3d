import sys, numpy as np, time
sys.path.insert(0, '.')
from glbio import write_glb
D = 'tiles'; OUT = sys.argv[1]; t0 = time.time()
H = np.load(D + '/_H4.npy')
def ramp(y):
    t = np.clip((y + 25) / 55, 0, 1)[:, None]; lo = np.array([0.30, 0.46, 0.25]); hi = np.array([0.74, 0.70, 0.52]); return lo + (hi - lo) * t
def terrain(Hs, step):
    gh, gw = Hs.shape; jj, ii = np.meshgrid(np.arange(gw), np.arange(gh)); P = np.stack([jj * step, Hs, -ii * step], -1).reshape(-1, 3).astype(np.float32)
    a = (ii[:-1, :-1] * gw + jj[:-1, :-1]).ravel(); b = a + 1; c = a + gw; d = c + 1
    T = np.concatenate([np.stack([a, b, c], 1), np.stack([b, d, c], 1)]).astype(np.int64); return P, T
BC = np.array([0.80, 0.78, 0.75])
# --- LOD1: Gelände 8 m + Voxel-Säulen
P1, T1 = terrain(H[::2, ::2], 8.0); l1 = np.load(D + '/_l1.npz'); BP, BT = l1['P'], l1['T']
P = np.concatenate([P1, BP]); T = np.concatenate([T1, BT + len(P1)]); C = np.concatenate([ramp(P1[:, 1]), np.tile(BC, (len(BP), 1))])
sz = write_glb(OUT + '/Dortmund_48Zellen_LOD1.glb', P, T, C, 'Dortmund LOD1'); print('LOD1: %.1f MB, %d Dreiecke (%.0f s)' % (sz / 1e6, len(T), time.time() - t0))
# --- Voll, bereinigt: Gelände 4 m mit geschlossenen Nähten + Gebäude (ohne die 21.541 Dreiecke außerhalb)
d = np.load('out/merged.npz'); bp, bt = d['bp'], d['bt']; ctr = bp[bt].mean(1)
ins = (ctr[:, 0] >= 0) & (ctr[:, 0] < 3068) & (ctr[:, 2] <= 0) & (ctr[:, 2] > -4092); bt = bt[ins]
used, inv = np.unique(bt, return_inverse=True); bp = bp[used]; bt = inv.reshape(-1, 3)
P0, T0 = terrain(H, 4.0)
P = np.concatenate([P0, bp]); T = np.concatenate([T0, bt + len(P0)]); C = np.concatenate([ramp(P0[:, 1]), np.tile(BC, (len(bp), 1))])
sz = write_glb(OUT + '/Dortmund_48Zellen_bereinigt.glb', P, T, C, 'Dortmund bereinigt'); print('voll: %.1f MB, %d Dreiecke (%.0f s)' % (sz / 1e6, len(T), time.time() - t0))
