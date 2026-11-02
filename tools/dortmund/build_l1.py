# L1-Gebäude als Voxel-Säulen (4 m), nur sichtbare Flächen, Spitzen und Wände verschmolzen. Aufruf: python3 -I build_l1.py tiles
import sys, json, time, numpy as np
D = sys.argv[1]; STEP = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0; t0 = time.time()
H = np.load(D + '/_H4.npy'); city2 = np.load(D + '/_city2.npy'); isb2 = np.load(D + '/_isb2.npy')
BW, BH = H.shape[1] - 1, H.shape[0] - 1                 # 768 x 1024 Blöcke à 4 m
NONE = -9999
# 2-m-Pixel (Knoten) -> 4-m-Block: Knoten (2I,2J),(2I+1,2J),(2I,2J+1),(2I+1,2J+1)
def blk(A): return A[0:2 * BH:2, 0:2 * BW:2], A[1:2 * BH:2, 0:2 * BW:2], A[0:2 * BH:2, 1:2 * BW:2], A[1:2 * BH:2, 1:2 * BW:2]
bm = blk(isb2); cnt = sum(b.astype(np.int8) for b in bm); ch = blk(city2)
sumh = sum(np.where(b, c, 0.0) for b, c in zip(bm, ch)); mean = np.where(cnt > 0, sumh / np.maximum(cnt, 1), 0)
isb = cnt >= 2
tmin = np.minimum.reduce([H[:-1, :-1], H[1:, :-1], H[:-1, 1:], H[1:, 1:]])
top = np.where(isb, (np.rint(mean / STEP) * STEP).astype(int), NONE)                  # Dachhöhe auf 1 m gerundet (y-Koordinate)
top = np.where(isb & (top < np.floor(tmin) + 2), np.floor(tmin).astype(int) + 2, top)   # mindestens 2 m hoch
bot = np.floor(tmin - 2.0).astype(int)                                 # 2 m tief in den Boden, damit nichts schwebt
print('Blöcke mit Gebäude: %d von %d (%.1f %%)' % (isb.sum(), isb.size, 100 * isb.mean()))
def write_mesh(fn, P, T):
    lo, hi = P.min(0), P.max(0); sc = np.maximum(hi - lo, 1e-3)
    q = np.rint((P - lo) / sc * 65535).astype(np.uint16)
    u, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.reshape(-1)
    T2 = inv[T]; k = (T2[:, 0] != T2[:, 1]) & (T2[:, 1] != T2[:, 2]) & (T2[:, 0] != T2[:, 2]); T2 = T2[k]
    used, inv2 = np.unique(T2, return_inverse=True); u = u[used]; T2 = inv2.reshape(-1, 3)
    i16 = len(u) < 65536
    head = np.array([len(u), len(T2), 1 if i16 else 0, 0], np.uint32).tobytes() + np.concatenate([lo, hi]).astype(np.float32).tobytes()
    pos = u.tobytes(); pad = (-len(pos)) % 4; ib = T2.astype(np.uint16 if i16 else np.uint32).tobytes()
    open(fn, 'wb').write(head + pos + b'\0' * pad + ib); return len(head) + len(pos) + pad + len(ib), len(u), len(T2)
def runs(vals):                       # vals: Liste von Schlüsseln (None = leer) -> [(start, ende, schlüssel)]
    out = []; s = 0; n = len(vals)
    for a in range(1, n + 1):
        if a == n or vals[a] != vals[s]:
            if vals[s] is not None: out.append((s, a, vals[s]))
            s = a
    return out
manifest = json.load(open(D + '/manifest.json')); allP = []; allT = []; base = 0; tot = [0, 0]
for cz in range(8):
    for cx in range(6):
        I0, J0 = cz * 128, cx * 128; quads = []         # (x0,x1,y0,y1,z0,z1 als Ecken) wir sammeln Vierecke als 4 Punkte
        def Q(a, b, c, d): quads.append((a, b, c, d))
        # Dächer: verschmolzene Rechtecke gleicher Höhe
        Tn = top[I0:I0 + 128, J0:J0 + 128]; opn = {}
        for i in range(129):
            cur = {}
            if i < 128:
                row = [int(v) if v != NONE else None for v in Tn[i]]
                for s, e, v in runs(row): cur[(s, e, v)] = 1
            for k in [k for k in opn if k not in cur]:
                i0 = opn.pop(k); s, e, v = k
                x0, x1 = 4 * (J0 + s), 4 * (J0 + e); z0, z1 = -4 * (I0 + i0), -4 * (I0 + i)
                Q((x0, v, z0), (x1, v, z0), (x1, v, z1), (x0, v, z1))
            for k in cur:
                if k not in opn: opn[k] = i
        # Wände in x-Richtung (zwischen Spalte j und j+1), pro Zwischenraum über Zeilen verschmolzen
        for j in range(128):
            J = J0 + j
            if J + 1 >= BW: continue
            a = top[I0:I0 + 128, J]; b = top[I0:I0 + 128, J + 1]; ba = bot[I0:I0 + 128, J]; bb = bot[I0:I0 + 128, J + 1]
            keys = []
            for r in range(128):
                ta, tb = int(a[r]), int(b[r])
                if ta == tb: keys.append(None)
                elif ta != NONE and tb == NONE: keys.append((int(ba[r]), ta))
                elif tb != NONE and ta == NONE: keys.append((int(bb[r]), tb))
                else: keys.append((min(ta, tb), max(ta, tb)))
            x = 4 * (J + 1)
            for s, e, (lo, hi) in runs(keys):
                z0, z1 = -4 * (I0 + s), -4 * (I0 + e); Q((x, lo, z0), (x, lo, z1), (x, hi, z1), (x, hi, z0))
        # Wände in z-Richtung (zwischen Zeile i und i+1)
        for i in range(128):
            I = I0 + i
            if I + 1 >= BH: continue
            a = top[I, J0:J0 + 128]; b = top[I + 1, J0:J0 + 128]; ba = bot[I, J0:J0 + 128]; bb = bot[I + 1, J0:J0 + 128]
            keys = []
            for c in range(128):
                ta, tb = int(a[c]), int(b[c])
                if ta == tb: keys.append(None)
                elif ta != NONE and tb == NONE: keys.append((int(ba[c]), ta))
                elif tb != NONE and ta == NONE: keys.append((int(bb[c]), tb))
                else: keys.append((min(ta, tb), max(ta, tb)))
            z = -4 * (I + 1)
            for s, e, (lo, hi) in runs(keys):
                x0, x1 = 4 * (J0 + s), 4 * (J0 + e); Q((x0, lo, z), (x1, lo, z), (x1, hi, z), (x0, hi, z))
        key = '%d_%d' % (cx, cz)
        if not quads:
            manifest['tiles'].setdefault(key, {}).pop('b1', None); continue
        Pq = np.array(quads, np.float64).reshape(-1, 3); n = len(quads)
        T = np.zeros((n * 2, 3), np.int64); idx = np.arange(n) * 4
        T[0::2] = np.stack([idx, idx + 1, idx + 2], 1); T[1::2] = np.stack([idx, idx + 2, idx + 3], 1)
        sz, nv, nt = write_mesh(D + '/b1_%d_%d.bin' % (cx, cz), Pq, T); ent = manifest['tiles'][key]; ent['b1'] = sz; ent['b1_tris'] = int(nt)
        tot[0] += sz; tot[1] += nt; allP.append(Pq.astype(np.float32)); allT.append(T + base); base += len(Pq)
manifest['stats']['tris_buildings_L1'] = int(tot[1]); manifest['stats']['bytes_b1'] = int(tot[0]); manifest['stats']['l1_art'] = 'Voxel-Säulen 4 m, %g-m-Höhenstufen' % STEP
json.dump(manifest, open(D + '/manifest.json', 'w'))
np.savez_compressed(D + '/_l1.npz', P=np.concatenate(allP), T=np.concatenate(allT))
print('L1 Voxel-Säulen: %.2f MB, %d Dreiecke (statt L0: %d) | %.1f s' % (tot[0] / 1e6, tot[1], manifest['stats']['tris_buildings_L0'], time.time() - t0))
