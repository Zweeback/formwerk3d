#!/usr/bin/env python3
"""Liest NRW-LoD2-Kacheln (CityGML 1.0) und liefert Dreiecke in Viewer-Koordinaten.

    x = E - E0,  y = Höhe - 100,  z = -(N - N0)      (E0=392192, N0=5704704, EPSG:25832)

Es werden nur Wand- und Dachflächen gelesen (Boden- und Verschlussflächen sind unsichtbar bzw. virtuell).
Jedes Gebäude (cityObjectMember) bleibt ein Ganzes; seine Zuordnung zu Zellen entscheidet der Aufrufer
über den Mittelpunkt (Array `owner` = Gebäudenummer je Dreieck).
"""
import re, numpy as np, mapbox_earcut as earcut

E0, N0 = 392192.0, 5704704.0
RE_MEMBER = re.compile(r'<core:cityObjectMember>(.*?)</core:cityObjectMember>', re.S)
RE_SURF = re.compile(r'<bldg:(?:WallSurface|RoofSurface|OuterCeilingSurface|OuterFloorSurface)[ >].*?</bldg:(?:WallSurface|RoofSurface|OuterCeilingSurface|OuterFloorSurface)>', re.S)
RE_POLY = re.compile(r'<gml:Polygon[^>]*>(.*?)</gml:Polygon>', re.S)
RE_POS = re.compile(r'<gml:posList[^>]*>([^<]*)</gml:posList>')


def _ring(txt):
    a = np.fromstring(txt, sep=' ', dtype=np.float64)
    a = a[: len(a) // 3 * 3].reshape(-1, 3)
    if len(a) > 1 and np.allclose(a[0], a[-1]): a = a[:-1]
    return a


def _tri(rings):
    """Planares 3D-Polygon (mit Löchern) -> Dreiecke (Indizes in vstack(rings))."""
    P = np.vstack(rings); n = len(rings[0])
    if len(rings) == 1 and n == 3: return P, np.array([[0, 1, 2]])
    if len(rings) == 1 and n == 4: return P, np.array([[0, 1, 2], [0, 2, 3]])
    # Ebene: dominante Normale (Newell), Achse mit größtem Anteil weglassen
    r = rings[0]; nx = ny = nz = 0.0
    q = np.roll(r, -1, axis=0)
    nx = ((r[:, 1] - q[:, 1]) * (r[:, 2] + q[:, 2])).sum(); ny = ((r[:, 2] - q[:, 2]) * (r[:, 0] + q[:, 0])).sum(); nz = ((r[:, 0] - q[:, 0]) * (r[:, 1] + q[:, 1])).sum()
    k = int(np.argmax(np.abs([nx, ny, nz])))
    uv = np.delete(P, k, axis=1)
    ends = np.cumsum([len(x) for x in rings]).astype(np.uint32)
    idx = earcut.triangulate_float64(uv, ends).reshape(-1, 3)
    return P, idx


def read_tile(path):
    """-> (V (n,3) float64 in Viewer-Koordinaten, T (m,3) int32, owner (m,) int32, centroids (nb,3))"""
    s = open(path, encoding='utf-8').read()
    Vs, Ts, Os, C = [], [], [], []; base = 0; nb = 0
    for mm in RE_MEMBER.finditer(s):
        body = mm.group(1)
        if '<bldg:Building' not in body: continue
        pv, pt = [], []
        for sm in RE_SURF.finditer(body):
            for pm in RE_POLY.finditer(sm.group(0)):
                rings = [_ring(t) for t in RE_POS.findall(pm.group(1))]
                if not rings or len(rings[0]) < 3: continue
                try: P, idx = _tri(rings)
                except Exception: continue
                if not len(idx): continue
                pt.append(idx + sum(len(x) for x in pv)); pv.append(P)
        if not pv: continue
        V = np.vstack(pv); T = np.vstack(pt)
        V = np.stack([V[:, 0] - E0, V[:, 2] - 100.0, -(V[:, 1] - N0)], 1)
        Vs.append(V); Ts.append(T + base); Os.append(np.full(len(T), nb, np.int32)); C.append(V.mean(0)); base += len(V); nb += 1
    if not Vs: return np.zeros((0, 3)), np.zeros((0, 3), np.int32), np.zeros(0, np.int32), np.zeros((0, 3))
    return np.vstack(Vs), np.vstack(Ts).astype(np.int32), np.concatenate(Os), np.array(C)
