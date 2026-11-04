#!/usr/bin/env python3
"""Packt die Foto-Mesh-Kacheln (docs/dortmund/city*, *.msh) in wenige groessere Dateien fuer die Chat-Fassung (Claude-Artefakt).
Aufruf:  python3 -I build_lite.py <docs/dortmund> <ausgabe> [max_tiefe_je_ordner, z. B. city:19,city3:18] [pack_MB=1.5] [radius_m=0]
radius_m: Die tiefste Stufe (Tiefe 19) wird nur dort behalten, wo ihr Elternknoten (Tiefe 18) naeher als radius_m an einem der Orte (Mathilde, Reinoldikirche, Hbf) liegt.
Ergebnis: <ausgabe>/packs/pNN.txt und <ausgabe>/index.json (Knotenbaum mit pack/off/len).
Die Packs sind Base64-Text (Artefakte duerfen keine rohen Binaerdateien ausliefern); jede Kachel beginnt auf einer durch 3 teilbaren Position,
damit man per Bereichsabruf (Range) genau ihren Base64-Ausschnitt holen kann: Bytes [off, off+len) = Zeichen [off/3*4, ceil((off+len)/3)*4).
Index-Zeile je Knoten: [id, tiefe, eltern(-1), [kinder], [x0,y0,z0,x1,y1,z1], pack, off, len, dreiecke]"""
import base64, json, math, os, sys
POI = [(3896, -597), (1364, -3364), (908, -3830)]

def morton(x, z):
    x = int(x) & 0xFFFF; z = int(z) & 0xFFFF; r = 0
    for b in range(16): r |= ((x >> b) & 1) << (2 * b) | ((z >> b) & 1) << (2 * b + 1)
    return r

def main():
    src, out = sys.argv[1], sys.argv[2]
    lim = dict(a.split(':') for a in sys.argv[3].split(',')) if len(sys.argv) > 3 and sys.argv[3] else {}
    target = float(sys.argv[4] if len(sys.argv) > 4 else 1.5) * 1048576; R = float(sys.argv[5]) if len(sys.argv) > 5 else 0
    os.makedirs(out + '/packs', exist_ok=True)
    nodes = []; gid = {}
    for di, d in enumerate(sorted(lim)):
        m = json.load(open(f'{src}/{d}/manifest.json')); maxd = int(lim[d])
        for n in m['nodes']:
            if n['d'] > maxd: continue
            n['dir'] = d; n['g'] = len(nodes); gid[(d, n['id'])] = n['g']; nodes.append(n)
    if R > 0:
        dmax = {}
        for n in nodes: dmax[n['dir']] = max(dmax.get(n['dir'], 0), n['d'])
        byg = {n['g']: n for n in nodes}; drop = set()
        for n in nodes:
            if n['d'] == dmax[n['dir']] and n['d'] >= 19:
                par = byg.get(gid.get((n['dir'], n['p'])))
                if par is None: continue
                cx, cz = (par['box'][0] + par['box'][3]) / 2, (par['box'][2] + par['box'][5]) / 2
                if min(math.hypot(cx - x, cz - z) for x, z in POI) > R: drop.add(n['g'])
        nodes = [n for n in nodes if n['g'] not in drop]
    for i, n in enumerate(nodes): n['g'] = i   # fortlaufend nummerieren: der Viewer nutzt die Zeilennummer als Knotennummer
    gid = {(n['dir'], n['id']): n['g'] for n in nodes}
    for n in nodes:
        n['gp'] = gid.get((n['dir'], n['p']), -1)
        n['gch'] = [gid[(n['dir'], c)] for c in n['ch'] if (n['dir'], c) in gid]
        if len(n['gch']) != len(n['ch']): n['gch'] = []   # Kinder fehlen -> nicht weiter verfeinern
    # je Ordner und Tiefe in Z-Ordnung aneinanderhaengen, Dateien um target Bytes
    groups = {}
    for n in nodes: groups.setdefault((n['dir'], n['d']), []).append(n)
    pk = 0; total = 0
    def close(c):
        open(f"{out}/packs/p{c['i']:02d}.txt", 'w').write(base64.b64encode(bytes(c['buf'])).decode('ascii'))
    for key in sorted(groups):
        g = sorted(groups[key], key=lambda n: morton((n['box'][0] + n['box'][3]) / 8, (-n['box'][2] - n['box'][5]) / 8))
        cur = None
        for n in g:
            data = open(f"{src}/{n['dir']}/{n['f']}", 'rb').read()
            if cur is None or cur['size'] + len(data) > target and cur['size'] > 0:
                if cur: close(cur)
                cur = {'i': pk, 'size': 0, 'buf': bytearray()}; pk += 1
            n['pack'] = cur['i']; n['off'] = cur['size']; n['len'] = len(data); pad = (-len(data)) % 3
            cur['buf'] += data + b'\0' * pad; cur['size'] += len(data) + pad; total += len(data)
        if cur: close(cur)
    rows = [[n['g'], n['d'], n['gp'], n['gch'], [round(v, 1) for v in n['box']], n['pack'], n['off'], n['len'], n['nt']] for n in nodes]
    json.dump({'v': 1, 'origin': [392192, 5704704, 100], 'packs': pk, 'nodes': rows}, open(out + '/index.json', 'w'), separators=(',', ':'))
    print(len(nodes), 'Knoten,', pk, 'Packs,', round(total / 1048576, 1), 'MB,', round(os.path.getsize(out + '/index.json') / 1024), 'KB Index')

main()
