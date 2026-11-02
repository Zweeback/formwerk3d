#!/usr/bin/env python3
"""Erzeugt die Spieldaten aus den Kacheln:  python3 -I build_game_data.py tiles [start_x start_z hospital_x hospital_z]

  ground.bin   Höhenkarte 4 m, uint16 ((y+40)*1000), Zeilen nach Norden aufsteigend (wie h0-Kacheln, ganzes Gebiet)
  col.bin      Belegung 2 m (1 = Gebäude), 1 Bit je Zelle, LSB zuerst, Zeile i = -z/2, Spalte j = x/2
  main.bin     freie Fläche mit 4 m Abstand zu Gebäuden, nur die größte zusammenhängende (Ziele müssen erreichbar sein)
  mission.json Größen, Start, Krankenhaus (Platzhalter), Orte
"""
import sys, json, numpy as np
from scipy import ndimage as ndi
D = sys.argv[1].rstrip('/')
H = np.load(D + '/_H4.npy'); isb = np.load(D + '/_isb2.npy')
GH, GW = H.shape; h, w = isb.shape; rb = (w + 7) // 8
pack = lambda a: np.packbits(np.pad(a, ((0, 0), (0, rb * 8 - w))), axis=1, bitorder='little').tobytes()
open(D + '/ground.bin', 'wb').write(np.clip(np.rint((H + 40) * 1000), 0, 65535).astype(np.uint16).tobytes())
open(D + '/col.bin', 'wb').write(pack(isb))
free = ~isb
er = ndi.binary_erosion(free, iterations=2, border_value=0)
lab, n = ndi.label(er); s = np.bincount(lab.ravel()); s[0] = 0; main = lab == s.argmax()
open(D + '/main.bin', 'wb').write(pack(main))
print('Boden %dx%d, Belegung %dx%d (%.1f %% Gebäude), freie Hauptfläche %.1f %% (%d Teilflächen)' % (GW, GH, w, h, 100 * isb.mean(), 100 * main.mean(), n))


def near_main(x, z, maxr=400):
    for r in range(0, maxr, 2):
        for a in np.arange(0, 360, 15):
            px = x + r * np.sin(np.radians(a)); pz = z + r * np.cos(np.radians(a)); i = int(round(-pz / 2)); j = int(round(px / 2))
            if 0 <= i < h and 0 <= j < w and main[i, j]: return float(px), float(pz)
    raise SystemExit('kein freier Punkt in der Nähe von %s,%s' % (x, z))


old = {}
try: old = json.load(open(D + '/mission.json'))
except Exception: pass
a = [float(v) for v in sys.argv[2:6]]
sx, sz = near_main(*(a[0:2] if len(a) >= 2 else (old.get('start', {}).get('x', 1502.0), old.get('start', {}).get('z', -2400.0))))
hx, hz = near_main(*(a[2:4] if len(a) >= 4 else (old.get('hospital', {}).get('x', 446.0), old.get('hospital', {}).get('z', -1490.0))))
poi = {'Schlanke Mathilde (Uhr, Hörde)': {'x': 3714.0, 'z': -552.0, 'lat': 51.4888574, 'lon': 7.5006916},
       'Hörder Burgplatz (Phoenix-See)': {'x': 4101.0, 'z': -861.0, 'lat': 51.491707, 'lon': 7.506175}}
for o in poi.values(): o['y'] = round(float(H[int(round(-o['z'] / 4)), int(round(o['x'] / 4))]), 2)
mj = {'start': {'x': sx, 'z': sz, 'heading': float(old.get('start', {}).get('heading', 0.0))},
      'hospital': {'x': hx, 'z': hz, 'name': old.get('hospital', {}).get('name', 'Krankenhaus (Platzhalter, bitte echte Koordinaten eintragen)')},
      'row_bytes': rb, 'w': w, 'h': h, 'gw': GW, 'gh': GH, 'orte': poi if GW > 769 else {}}
json.dump(mj, open(D + '/mission.json', 'w'), ensure_ascii=False)
print('mission.json:', {k: mj[k] for k in ('start', 'hospital', 'w', 'h', 'gw', 'gh')})
