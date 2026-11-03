#!/usr/bin/env python3
"""Liest nur das Inhaltsverzeichnis (Central Directory) eines riesigen SLPK-Zips per HTTP-Bereichsabruf und speichert einen Index.

    python3 -I slpk_index.py URL index.pkl

SLPK = Zip64, Einträge unkomprimiert abgelegt (Methode 0). Danach lässt sich jede Datei einzeln per Bereichsabruf holen (slpk_read in slpk_lib.py).
"""
import sys, struct, pickle, urllib.request, time
URL, OUT = sys.argv[1], sys.argv[2]
def rng(a, b):
    for k in range(5):
        try: return urllib.request.urlopen(urllib.request.Request(URL, headers={'Range': 'bytes=%d-%d' % (a, b - 1)}), timeout=600).read()
        except Exception as e: print('Wiederholung', k, e); time.sleep(3)
    raise SystemExit('Abruf fehlgeschlagen')
size = int(urllib.request.urlopen(urllib.request.Request(URL, method='HEAD'), timeout=60).headers['Content-Length'])
tail = rng(size - 200, size); j = tail.rfind(b'PK\x06\x07'); off64 = struct.unpack('<IIQI', tail[j:j + 20])[2]
e64 = rng(off64, off64 + 56); n_all, cdsize, cdoff = struct.unpack('<QQQ', e64[32:56]); print('Einträge', n_all, 'CD %.1f MB' % (cdsize / 1e6), flush=True)
cd = bytearray(); CH = 16 * 1024 * 1024; p = cdoff
while p < cdoff + cdsize:
    q = min(cdoff + cdsize, p + CH); cd += rng(p, q); p = q; print('  %.0f %%' % (100 * (p - cdoff) / cdsize), flush=True)
names = []; hoff = []; csize = []; usize = []; meth = []; i = 0
while i < len(cd):
    sig, vm, vn, fl, mt, tm, dt, crc, cs, us, nl, el, cl, ds, ia, ea, lo = struct.unpack('<IHHHHHHIIIHHHHHII', cd[i:i + 46])
    assert sig == 0x02014b50, i
    name = bytes(cd[i + 46:i + 46 + nl]).decode('utf-8', 'replace'); ex = cd[i + 46 + nl:i + 46 + nl + el]
    k = 0
    while k + 4 <= len(ex):
        tag, ln = struct.unpack('<HH', ex[k:k + 4])
        if tag == 1:                                                    # Zip64: nur Felder, die im Kopf 0xFFFFFFFF sind, in fester Reihenfolge
            q = k + 4
            if us == 0xFFFFFFFF: us = struct.unpack('<Q', ex[q:q + 8])[0]; q += 8
            if cs == 0xFFFFFFFF: cs = struct.unpack('<Q', ex[q:q + 8])[0]; q += 8
            if lo == 0xFFFFFFFF: lo = struct.unpack('<Q', ex[q:q + 8])[0]; q += 8
        k += 4 + ln
    names.append(name); hoff.append(lo); csize.append(cs); usize.append(us); meth.append(mt); i += 46 + nl + el + cl
print('gelesen:', len(names)); pickle.dump({'url': URL, 'size': size, 'names': names, 'hoff': hoff, 'csize': csize, 'usize': usize, 'meth': meth}, open(OUT, 'wb'))
