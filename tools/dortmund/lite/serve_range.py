import sys, os, re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
NORANGE = '--norange' in sys.argv
class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def send_head(self):
        rng = self.headers.get('Range')
        path = self.translate_path(self.path)
        if NORANGE or not rng or not os.path.isfile(path): return super().send_head()
        m = re.match(r'bytes=(\d+)-(\d*)', rng)
        size = os.path.getsize(path); a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else size - 1; b = min(b, size - 1)
        f = open(path, 'rb'); f.seek(a)
        self.send_response(206); self.send_header('Content-Type', self.guess_type(path)); self.send_header('Content-Range', f'bytes {a}-{b}/{size}'); self.send_header('Content-Length', str(b - a + 1)); self.send_header('Accept-Ranges', 'bytes'); self.end_headers()
        self._left = b - a + 1; return f
    def copyfile(self, src, dst):
        left = getattr(self, '_left', None)
        if left is None: return super().copyfile(src, dst)
        while left > 0:
            d = src.read(min(65536, left))
            if not d: break
            dst.write(d); left -= len(d)
        self._left = None
port = int(sys.argv[1]); os.chdir(sys.argv[2])
ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
