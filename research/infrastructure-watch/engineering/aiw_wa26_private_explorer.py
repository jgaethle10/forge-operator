#!/usr/bin/env python3
"""Private loopback viewer for the independently managed Washington bridge API.

Only GET /, /healthz and GET /api/bridges with a restricted query string.
Browser never accesses API on separate port, avoiding CORS and public routing.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

BACKEND = "http://127.0.0.1:8790"


def handler(page):
    html = Path(page).read_bytes()
    class Viewer(BaseHTTPRequestHandler):
        def reply(self, status, raw, content_type="application/json; charset=utf-8"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            if parsed.path in ("/", "/index.html") and not parsed.query:
                return self.reply(200,html,"text/html; charset=utf-8")
            if parsed.path == "/healthz" and not parsed.query:
                return self.reply(200,json.dumps({"status":"ready","visibility":"private_loopback_only","backend":"127.0.0.1:8790","public_release_ready":False}).encode())
            if parsed.path != "/api/bridges":
                return self.reply(404,b'{"error":"not_found"}')
            if len(parsed.query) > 250 or "%" in parsed.path:
                return self.reply(400,b'{"error":"invalid_query"}')
            try:
                params = urllib.parse.parse_qs(parsed.query,strict_parsing=True,keep_blank_values=True)
                if set(params)-{"condition","county","limit","offset","mapped_only"} or any(len(v)!=1 for v in params.values()):
                    raise ValueError
                if any(any(ord(ch)<32 or ord(ch)>126 for ch in v[0]) for v in params.values()):
                    raise ValueError
                query = urllib.parse.urlencode([(k,v[0]) for k,v in params.items()])
                target=BACKEND+"/api/v1/bridges?"+query
                with urllib.request.urlopen(target,timeout=5) as upstream:
                    raw=upstream.read(200000+1)
                    if len(raw)>200000:
                        raise ValueError("upstream response too large")
                return self.reply(200,raw)
            except (ValueError, urllib.error.HTTPError) as e:
                if isinstance(e,urllib.error.HTTPError) and e.code==400:
                    return self.reply(400,b'{"error":"invalid_query"}')
                if isinstance(e,ValueError):
                    return self.reply(400,b'{"error":"invalid_query"}')
                return self.reply(502,b'{"error":"evidence_backend_unavailable"}')
            except (OSError, TimeoutError, urllib.error.URLError):
                return self.reply(503,b'{"error":"evidence_backend_unavailable"}')

        def do_POST(self):
            return self.reply(405,b'{"error":"read_only"}')
        do_PUT=do_POST
        do_PATCH=do_POST
        do_DELETE=do_POST

        def log_message(self,*_):
            pass
    return Viewer


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html",required=True)
    parser.add_argument("--port",type=int,default=8791)
    args=parser.parse_args()
    if not 1024<=args.port<=65535:
        parser.error("port out of range")
    server=ThreadingHTTPServer(("127.0.0.1",args.port),handler(args.html))
    print(f"Private WA 2026 explorer listening on 127.0.0.1:{args.port}",flush=True)
    server.serve_forever()


if __name__=="__main__":
    main()
