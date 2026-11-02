# Bereinigt die 48 Zellen und erzeugt die Kachel-Pyramide. Aufruf: python3 -I build_tiles.py out_dir
import sys, os, json, time, numpy as np
import fast_simplification as fs
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
t0 = time.time()
def lap(s): print('[%5.1fs] %s' % (time.time() - t0, s), flush=True)
d = np.load('out/merged.npz'); tp, tt, bp, bt = d['tp'], d['tt'], d['bp'], d['bt']
NX, NZ, CS = 6, 8, 512.0
GW, GH = NX * 128 + 1, NZ * 128 + 1           # 769 x 1025 Knoten im 4-m-Raster
# ---- 1) Gelände: Knoten mitteln -> Nähte geschlossen
j = np.rint(tp[:, 0] / 4).astype(int); i = np.rint(-tp[:, 2] / 4).astype(int)
assert j.min() >= 0 and j.max() < GW and i.min() >= 0 and i.max() < GH
S = np.zeros((GH, GW)); C = np.zeros((GH, GW)); np.add.at(S, (i, j), tp[:, 1]); np.add.at(C, (i, j), 1)
assert (C > 0).all(), 'Loch im Raster'
H = (S / C).astype(np.float32)
dev = np.abs(tp[:, 1] - H[i, j]); lap('Gelände gemittelt: Knoten an Nähten %d, größte Korrektur %.2f m, Ø %.3f m' % ((C > 1).sum(), dev.max(), dev[C[i, j] > 1].mean()))
# ---- 2) Gebäude: Dreiecke außerhalb entfernen
ctr = bp[bt].mean(1); inside = (ctr[:, 0] >= 0) & (ctr[:, 0] < GW * 4 - 4) & (ctr[:, 2] <= 0) & (ctr[:, 2] > -(GH * 4 - 4))
lap('Gebäude-Dreiecke außerhalb des Geländes entfernt: %d von %d' % ((~inside).sum(), len(bt)))
bt = bt[inside]; ctr = ctr[inside]
# Raster der Dächer (2 m)
def raster_max(P, T, shape, cell):
    out = np.full(shape, -1e9, np.float32)
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    n = np.cross(b - a, c - a); ny = np.abs(n[:, 1]) / np.maximum(np.linalg.norm(n, axis=1), 1e-9)
    k = ny > 0.05
    a, b, c = a[k], b[k], c[k]
    U = np.stack([a[:, 0], b[:, 0], c[:, 0]], 1) / cell; V = -np.stack([a[:, 2], b[:, 2], c[:, 2]], 1) / cell; Y = np.stack([a[:, 1], b[:, 1], c[:, 1]], 1)
    j0 = np.ceil(U.min(1)).astype(int); j1 = np.floor(U.max(1)).astype(int); i0 = np.ceil(V.min(1)).astype(int); i1 = np.floor(V.max(1)).astype(int)
    ni = i1 - i0 + 1; nj = j1 - j0 + 1; ok = (ni > 0) & (nj > 0)
    big = 0
    def run(sel, K1, K2):
        idx = np.flatnonzero(sel)
        if not len(idx): return
        u, v, y = U[idx], V[idx], Y[idx]
        det = (v[:, 1] - v[:, 2]) * (u[:, 0] - u[:, 2]) + (u[:, 2] - u[:, 1]) * (v[:, 0] - v[:, 2])
        good = np.abs(det) > 1e-9
        for di in range(K1):
            for dj in range(K2):
                m = good & (di < ni[idx]) & (dj < nj[idx])
                if not m.any(): continue
                jj = j0[idx][m] + dj; ii = i0[idx][m] + di
                px = jj.astype(float); py = ii.astype(float)
                uu, vv, yy, dd = u[m], v[m], y[m], det[m]
                l1 = ((vv[:, 1] - vv[:, 2]) * (px - uu[:, 2]) + (uu[:, 2] - uu[:, 1]) * (py - vv[:, 2])) / dd
                l2 = ((vv[:, 2] - vv[:, 0]) * (px - uu[:, 2]) + (uu[:, 0] - uu[:, 2]) * (py - vv[:, 2])) / dd
                l3 = 1 - l1 - l2; e = -1e-6
                hit = (l1 >= e) & (l2 >= e) & (l3 >= e) & (jj >= 0) & (jj < shape[1]) & (ii >= 0) & (ii < shape[0])
                if hit.any():
                    val = l1[hit] * yy[hit, 0] + l2[hit] * yy[hit, 1] + l3[hit] * yy[hit, 2]
                    np.maximum.at(out, (ii[hit], jj[hit]), val.astype(np.float32))
    run(ok & (ni <= 4) & (nj <= 4), 4, 4)
    run(ok & ~((ni <= 4) & (nj <= 4)) & (ni <= 16) & (nj <= 16), 16, 16)
    run(ok & ((ni > 16) | (nj > 16)) & (ni <= 80) & (nj <= 80), 80, 80)
    return out
G2W, G2H = (GW - 1) * 2 + 1, (GH - 1) * 2 + 1
roof2 = raster_max(bp, bt, (G2H, G2W), 2.0); lap('Dach-Raster 2 m fertig')
# Gelände 2 m (bilinear)
Hx = np.repeat(np.arange(GW), 2)[:-1]; 
def up2(H):
    A = np.zeros((GH * 2 - 1, GW * 2 - 1), np.float32); A[::2, ::2] = H
    A[1::2, ::2] = (H[:-1] + H[1:]) / 2; A[::2, 1::2] = (H[:, :-1] + H[:, 1:]) / 2
    A[1::2, 1::2] = (H[:-1, :-1] + H[1:, :-1] + H[:-1, 1:] + H[1:, 1:]) / 4; return A
T2 = up2(H)
isb = roof2 > T2 + 1.5
city2 = np.where(isb, roof2, T2).astype(np.float32)
lap('Stadt-Höhenkarte 2 m: %.1f %% Fläche Gebäude' % (100 * isb.mean()))
np.save(OUT + '/_H4.npy', H); np.save(OUT + '/_city2.npy', city2); np.save(OUT + '/_isb2.npy', isb)
# ---- 3) Quantisierung / Hilfsfunktionen
HMIN, HSC = -40.0, 1000.0                       # uint16: (y-HMIN)*1000  -> 1 mm, Bereich 65 m
def qh(a): return np.clip(np.rint((a - HMIN) * HSC), 0, 65535).astype(np.uint16)
def pool_max(A, step, R):     # Knoten (i*step) = Maximum im Umkreis R Knoten (konservativ)
    P = np.pad(A, R, mode='edge'); out = np.full(((A.shape[0] - 1) // step + 1, (A.shape[1] - 1) // step + 1), -1e9, np.float32)
    for di in range(-R, R + 1):
        for dj in range(-R, R + 1):
            sub = P[R + di: R + di + A.shape[0]: step, R + dj: R + dj + A.shape[1]: step][:out.shape[0], :out.shape[1]]
            out = np.maximum(out, sub)
    return out
manifest = {'grid': [NX, NZ], 'cell': CS, 'origin': {'epsg': 25832, 'E0': 392192, 'N0': 5704704}, 'axes': 'x=E-E0, y=h-100 (m), z=-(N-N0)',
            'hmin': HMIN, 'hsc': HSC, 'levels': {}, 'tiles': {}, 'license': 'Datenlizenz Deutschland - Zero - Version 2.0 (LoD2, DGM1 NRW)'}
# ---- 4) Höhenkarten-Kacheln
# L0 = Gelände 4 m (129), L1 = Gelände 8 m (65), L2 = Stadt 16 m (33), L3 = Stadt 64 m (9)
CITY4 = city2[::2, ::2]; ISB4 = isb[::2, ::2]
levels = {0: ('terrain', 4, H, None), 1: ('terrain', 8, H[::2, ::2], None)}
c16 = pool_max(city2, 8, 2); b16 = pool_max(isb.astype(np.float32), 8, 2) > 0.5      # Knoten alle 16 m
c64 = pool_max(city2, 32, 8); b64 = pool_max(isb.astype(np.float32), 32, 8) > 0.5    # alle 64 m
levels[2] = ('city', 16, c16, b16); levels[3] = ('city', 64, c64, b64)
sizes = {l: 0 for l in range(4)}
for l, (kind, res, A, B) in levels.items():
    n = int(CS / res) + 1; manifest['levels'][str(l)] = {'kind': kind, 'res': res, 'n': n}
    step = n - 1
    for cz in range(NZ):
        for cx in range(NX):
            sub = A[cz * step: cz * step + n, cx * step: cx * step + n]
            buf = qh(sub).tobytes()
            if B is not None: buf += B[cz * step: cz * step + n, cx * step: cx * step + n].astype(np.uint8).tobytes()
            fn = 'h%d_%d_%d.bin' % (l, cx, cz); open(OUT + '/' + fn, 'wb').write(buf); sizes[l] += len(buf)
            manifest['tiles'].setdefault('%d_%d' % (cx, cz), {})['h%d' % l] = len(buf)
lap('Höhenkarten: ' + ', '.join('L%d %.2f MB' % (l, sizes[l] / 1e6) for l in sizes))
# ---- 5) Gebäude-Kacheln L0 (voll) und L1 (vereinfacht)
cxi = np.clip(np.floor(ctr[:, 0] / CS).astype(int), 0, NX - 1); czi = np.clip(np.floor(-ctr[:, 2] / CS).astype(int), 0, NZ - 1)
def write_mesh(fn, P, T):
    # Quantisierung auf uint16 relativ zur Kachel-Box, Verschweißen, Entarten entfernen
    lo, hi = P.min(0), P.max(0); sc = np.maximum(hi - lo, 1e-3)
    q = np.rint((P - lo) / sc * 65535).astype(np.uint16)
    u, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.reshape(-1)
    T2_ = inv[T]; k = (T2_[:, 0] != T2_[:, 1]) & (T2_[:, 1] != T2_[:, 2]) & (T2_[:, 0] != T2_[:, 2]); T2_ = T2_[k]
    used, inv2 = np.unique(T2_, return_inverse=True); u = u[used]; T2_ = inv2.reshape(-1, 3)
    idx16 = len(u) < 65536
    head = np.array([len(u), len(T2_), 1 if idx16 else 0, 0], np.uint32).tobytes() + np.concatenate([lo, hi]).astype(np.float32).tobytes()
    pos = u.tobytes(); pad = (-len(pos)) % 4
    ib = T2_.astype(np.uint16 if idx16 else np.uint32).tobytes()
    open(fn, 'wb').write(head + pos + b'\0' * pad + ib); return len(head) + len(pos) + pad + len(ib), len(u), len(T2_)
tot = {0: [0, 0, 0], 1: [0, 0, 0]}; allL1P = []; allL1T = []; base = 0
for cz in range(NZ):
    for cx in range(NX):
        m = np.flatnonzero((cxi == cx) & (czi == cz))
        key = '%d_%d' % (cx, cz); ent = manifest['tiles'].setdefault(key, {})
        if not len(m): continue
        T = bt[m]; used, inv = np.unique(T, return_inverse=True); P = bp[used].astype(np.float64); T = inv.reshape(-1, 3)
        sz, nv, nt = write_mesh(OUT + '/b0_%d_%d.bin' % (cx, cz), P, T); ent['b0'] = sz; ent['b0_tris'] = int(nt)
        for q_, v in enumerate((sz, nv, nt)): tot[0][q_] += v
        # L1: erst nach Position verschweißen (1 cm), dann Quadric-Vereinfachung
        qk = np.rint(P * 100).astype(np.int64); uk, ii = np.unique(qk, axis=0, return_inverse=True); ii = ii.reshape(-1)
        Wp = (uk / 100.0).astype(np.float32); Wt = ii[T]; k = (Wt[:, 0] != Wt[:, 1]) & (Wt[:, 1] != Wt[:, 2]) & (Wt[:, 0] != Wt[:, 2]); Wt = Wt[k].astype(np.int32)
        try:
            sp, st = fs.simplify(Wp, Wt, target_reduction=0.9, agg=7)
        except Exception as ex:
            print('simplify fail', key, ex); sp, st = Wp, Wt
        sz1, nv1, nt1 = write_mesh(OUT + '/b1_%d_%d.bin' % (cx, cz), sp.astype(np.float64), st.astype(np.int64)); ent['b1'] = sz1; ent['b1_tris'] = int(nt1)
        for q_, v in enumerate((sz1, nv1, nt1)): tot[1][q_] += v
        allL1P.append(sp); allL1T.append(st + base); base += len(sp)
lap('Gebäude L0: %.1f MB, %d Dreiecke | L1: %.1f MB, %d Dreiecke' % (tot[0][0] / 1e6, tot[0][2], tot[1][0] / 1e6, tot[1][2]))
manifest['stats'] = {'tris_buildings_L0': int(tot[0][2]), 'tris_buildings_L1': int(tot[1][2]), 'bytes': {k: int(v) for k, v in sizes.items()}, 'bytes_b0': int(tot[0][0]), 'bytes_b1': int(tot[1][0])}
json.dump(manifest, open(OUT + '/manifest.json', 'w'))
np.savez_compressed(OUT + '/_l1.npz', P=np.concatenate(allL1P), T=np.concatenate(allL1T))
lap('fertig')
