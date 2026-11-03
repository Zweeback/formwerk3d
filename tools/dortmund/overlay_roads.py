import sys, json, numpy as np
from PIL import Image, ImageDraw
A = json.load(open('../../nrw/dlm_area.json')); T = 'viewer10/tiles/'
cx0, cz0, w = float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]); out = sys.argv[4]    # Mitte (x,z), Kantenlänge m
S = 3                                                                          # Pixel je m im Ausschnitt
im = Image.new('RGB', (w * S, w * S))
for cx in range(int((cx0 - w / 2) // 512), int((cx0 + w / 2) // 512) + 1):
    for cz in range(int((-cz0 - w / 2) // 512), int((-cz0 + w / 2) // 512) + 1):
        try: t = Image.open('%st0_%d_%d.jpg' % (T, cx, cz))
        except Exception: continue
        x0 = cx * 512; zn = -(cz + 1) * 512                                       # Nordrand (z klein)
        im.paste(t.resize((512 * S, 512 * S)), (int((x0 - (cx0 - w / 2)) * S), int((zn - (cz0 - w / 2)) * S)))
d = ImageDraw.Draw(im)
P = lambda p: ((p[0] - (cx0 - w / 2)) * S, (p[1] - (cz0 - w / 2)) * S)
for r in A['roads']:
    d.line([P(p) for p in r['pts']], fill=(255, 40, 40) if not r['fb'] else (255, 160, 0), width=2)
for r in A['paths']: d.line([P(p) for p in r['pts']], fill=(40, 255, 40), width=1)
for r in A['rail']: d.line([P(p) for p in r['pts']], fill=(255, 255, 0), width=1)
for a in A['water']:
    for ring in a['rings']: d.line([P(p) for p in ring], fill=(0, 255, 255), width=2)
im.save(out)
