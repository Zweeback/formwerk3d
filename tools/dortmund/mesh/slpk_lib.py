import pickle, struct, urllib.request, gzip, json, time
class Slpk:
    def __init__(s, pkl):
        d = pickle.load(open(pkl, 'rb')); s.url = d['url']; s.names = d['names']; s.hoff = d['hoff']; s.csize = d['csize']; s.usize = d['usize']; s.meth = d['meth']
        s.idx = {n: i for i, n in enumerate(s.names)}
    def _rng(s, a, b):
        for k in range(5):
            try: return urllib.request.urlopen(urllib.request.Request(s.url, headers={'Range': 'bytes=%d-%d' % (a, b - 1)}), timeout=300).read()
            except Exception as e: time.sleep(2)
        raise IOError('Bereichsabruf fehlgeschlagen ' + s.url)
    def raw(s, name):
        i = s.idx[name]; o = s.hoff[i]; h = s._rng(o, o + 30); nl, el = struct.unpack('<HH', h[26:30]); a = o + 30 + nl + el
        d = s._rng(a, a + s.csize[i]) if s.csize[i] else b''
        if s.meth[i] == 8:
            import zlib; d = zlib.decompress(d, -15)
        return d
    def read(s, name):
        d = s.raw(name)
        if name.endswith('.gz'):
            d = gzip.decompress(d)
        return d
    def json(s, name): return json.loads(s.read(name).decode('utf-8'))
