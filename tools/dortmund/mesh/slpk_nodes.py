#!/usr/bin/env python3
"""Holt alle Knotenseiten (nodepages) eines SLPK und speichert eine kompakte Knotentabelle: python3 -I slpk_nodes.py index.pkl nodes.pkl"""
import sys, pickle
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, __file__.rsplit('/', 1)[0] if '/' in __file__ else '.')
from slpk_lib import Slpk
S = Slpk(sys.argv[1]); pages = sorted(int(n.split('/')[1].split('.')[0]) for n in S.names if n.startswith('nodepages/'))
def get(p): return p, S.json('nodepages/%d.json.gz' % p)
nodes = {}
with ThreadPoolExecutor(24) as ex:
    for k, (p, d) in enumerate(ex.map(get, pages)):
        for nd in d['nodes']:
            m = nd.get('mesh'); o = nd['obb']
            nodes[nd['index']] = {'parent': nd.get('parentIndex'), 'children': nd.get('children', []), 'c': o['center'], 'h': o['halfSize'], 'q': o['quaternion'], 'lod': nd.get('lodThreshold'),
                                  'geo': m['geometry']['resource'] if m else None, 'vc': m['geometry'].get('vertexCount') if m else None, 'tex': m['material'].get('resource') if m else None, 'texel': m['material'].get('texelCountHint') if m else None}
        if k % 500 == 0: print(k, '/', len(pages), flush=True)
pickle.dump(nodes, open(sys.argv[2], 'wb')); print('Knoten:', len(nodes))
