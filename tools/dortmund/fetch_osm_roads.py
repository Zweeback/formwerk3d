#!/usr/bin/env python3
"""Holt die Straßen für das Dortmund-Gebiet von OpenStreetMap (Overpass-API)
und schreibt sie in Kachelkoordinaten nach  tiles/roads.json.

Läuft NICHT in der Claude-Sandbox (dort ist Overpass gesperrt), sondern in
deinem Codespace oder lokal mit Internet:

    pip install pyproj
    python3 fetch_osm_roads.py tiles            # schreibt tiles/roads.json
    python3 fetch_osm_roads.py tiles --offline antwort.json   # aus gespeicherter Antwort

Koordinaten wie im Viewer:  x = E - 392192,  z = -(N - 5704704)   (EPSG:25832)
Datenquelle: © OpenStreetMap-Mitwirkende, ODbL 1.0 (Namensnennung nötig,
abgeleitete Datenbank muss unter ODbL bleiben; fertige Bilder/Spiele nicht).
"""
import json, sys, time, urllib.request, urllib.parse
from pyproj import Transformer

E0, N0 = 392192.0, 5704704.0
W_M, H_M = 6 * 512.0, 8 * 512.0           # 6 x 8 Zellen
PAD = 40.0                                # etwas Rand, damit Straßen am Kachelrand nicht abbrechen
OVERPASS = ['https://overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter']

# Klasse -> (Breite in m, Fahrzeuge erlaubt, Fußgänger erlaubt)
CLASSES = {
    'motorway': (14, 1, 0), 'trunk': (12, 1, 0), 'primary': (10, 1, 1),
    'secondary': (9, 1, 1), 'tertiary': (8, 1, 1), 'unclassified': (7, 1, 1),
    'residential': (6.5, 1, 1), 'living_street': (5, 1, 1), 'service': (4, 1, 1),
    'pedestrian': (5, 0, 1), 'footway': (2.5, 0, 1), 'path': (2, 0, 1), 'cycleway': (2.5, 0, 1),
}
for c in list(CLASSES):
    if c in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary'):
        CLASSES[c + '_link'] = (max(5, CLASSES[c][0] - 4), 1, CLASSES[c][2])


def bbox_latlon():
    to_ll = Transformer.from_crs('EPSG:25832', 'EPSG:4326', always_xy=True)
    pts = [(E0 - PAD, N0 - PAD), (E0 + W_M + PAD, N0 - PAD),
           (E0 - PAD, N0 + H_M + PAD), (E0 + W_M + PAD, N0 + H_M + PAD)]
    ll = [to_ll.transform(e, n) for e, n in pts]
    lons = [p[0] for p in ll]; lats = [p[1] for p in ll]
    return min(lats), min(lons), max(lats), max(lons)


def query(bb):
    s, w, n, e = bb
    kinds = '|'.join(k for k in CLASSES)
    q = f'[out:json][timeout:180];way["highway"~"^({kinds})$"]({s:.6f},{w:.6f},{n:.6f},{e:.6f});out geom;'
    last = None
    for url in OVERPASS:
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(),
                                         headers={'User-Agent': 'formwerk3d-dortmund/1.0'})
            with urllib.request.urlopen(req, timeout=240) as r:
                return json.load(r)
        except Exception as ex:           # nächster Server
            last = ex; time.sleep(2)
    raise SystemExit(f'Overpass nicht erreichbar: {last}')


def convert(resp):
    """Overpass-Antwort -> Liste {c, w, v, f, p:[x,z,x,z,...]} in Kachelkoordinaten (0,1 m gerundet)."""
    from_ll = Transformer.from_crs('EPSG:4326', 'EPSG:25832', always_xy=True)
    out, skipped = [], 0
    for el in resp.get('elements', []):
        if el.get('type') != 'way' or 'geometry' not in el:
            continue
        tags = el.get('tags', {}); cls = tags.get('highway')
        if cls not in CLASSES:
            continue
        if tags.get('area') == 'yes' or tags.get('tunnel') in ('yes', 'building_passage') or tags.get('indoor'):
            skipped += 1; continue
        width, veh, ped = CLASSES[cls]
        try:                               # OSM-Breite nehmen, falls angegeben
            width = float(str(tags['width']).split()[0]) if 'width' in tags else width
        except ValueError:
            pass
        pts = []
        for g in el['geometry']:
            e, n = from_ll.transform(g['lon'], g['lat'])
            pts += [round(e - E0, 1), round(-(n - N0), 1)]
        if len(pts) < 4:
            continue
        out.append({'id': el.get('id'), 'c': cls, 'w': width, 'v': veh, 'f': ped,
                    'br': 1 if tags.get('bridge') in ('yes', 'viaduct') else 0,
                    'ow': 1 if tags.get('oneway') in ('yes', '1') else 0, 'p': pts})
    return out, skipped


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    tiles = args[0] if args else 'tiles'
    if '--offline' in sys.argv:
        resp = json.load(open(sys.argv[sys.argv.index('--offline') + 1]))
    else:
        bb = bbox_latlon()
        print('Bounding box (lat/lon):', [round(v, 5) for v in bb])
        resp = query(bb)
        json.dump(resp, open('overpass_antwort.json', 'w'))
    roads, skipped = convert(resp)
    # Statistik
    km = 0.0
    for r in roads:
        p = r['p']
        for i in range(0, len(p) - 2, 2):
            km += ((p[i + 2] - p[i]) ** 2 + (p[i + 3] - p[i + 1]) ** 2) ** .5 / 1000
    doc = {'quelle': 'OpenStreetMap contributors, ODbL 1.0', 'crs': 'Kachel: x=E-392192, z=-(N-5704704), EPSG:25832',
           'anzahl': len(roads), 'laenge_km': round(km, 1), 'strassen': roads}
    path = tiles.rstrip('/') + '/roads.json'
    json.dump(doc, open(path, 'w'), separators=(',', ':'))
    print(f'{len(roads)} Wege, {km:.1f} km, {skipped} übersprungen (Tunnel/Fläche) -> {path}')


if __name__ == '__main__':
    main()
