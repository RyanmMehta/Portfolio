# Local dev server: like `python3 -m http.server`, but tells browsers not to
# cache, so edits show up on a normal reload (desktop and phone alike).
import http.server


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


http.server.ThreadingHTTPServer(("", 5173), NoCacheHandler).serve_forever()
