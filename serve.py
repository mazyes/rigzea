"""Local dev server for rigzea. Disables caching so every refresh shows the latest files."""
import http.server
import os
import socketserver

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rigzea")
PORT = 3000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".woff2": "font/woff2",
        ".js": "text/javascript",
        ".css": "text/css",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        # Ignore conditional requests so the browser never gets a stale 304.
        for header in ("If-Modified-Since", "If-None-Match"):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class ReusableServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with ReusableServer(("", PORT), NoCacheHandler) as httpd:
        print(f"rigzea running at http://localhost:{PORT}/  (demo: /demo/)")
        httpd.serve_forever()
