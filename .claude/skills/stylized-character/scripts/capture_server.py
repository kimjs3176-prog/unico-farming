# Receives PNG captures from a page (POST /save?name=x, body = PNG) and writes them to build/review/ or out_dir.
# Run from the project root: python3 capture_server.py [out_dir]   (listens on 127.0.0.1:8767)
import http.server, os, re, sys, urllib.parse
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join('build', 'review'))  # run from the project root
os.makedirs(OUT, exist_ok=True)
class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS'); self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); name = re.sub(r'[^a-z0-9_-]', '', q.get('name', ['shot'])[0].lower()) or 'shot'
        data = self.rfile.read(int(self.headers['Content-Length']))
        open(os.path.join(OUT, name + '.png'), 'wb').write(data)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 8767), H).serve_forever()
