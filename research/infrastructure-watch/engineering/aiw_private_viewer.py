#!/usr/bin/env python3
"""Private loopback-only AIW operations viewer.

Serves the offline HTML and previously-generated sanitized status JSON.
Does not run collectors or timers. Never bind to a public address.
No external dependencies or outbound calls.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path

MAX_STATUS_BYTES = 128_000


def handler(html_path, status_path):
    class Viewer(BaseHTTPRequestHandler):
        def send_bytes(self, code, body, kind):
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy",
                "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
                "connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in ("/", "/index.html"):
                try:
                    return self.send_bytes(200, Path(html_path).read_bytes(), "text/html; charset=utf-8")
                except OSError:
                    return self.send_bytes(503, b"Viewer unavailable", "text/plain; charset=utf-8")
            if self.path == "/api/private-status":
                try:
                    raw = Path(status_path).read_bytes()
                    if len(raw) > MAX_STATUS_BYTES:
                        raise ValueError("Status receipt too large")
                    data = json.loads(raw)
                    if (not isinstance(data, dict)
                        or data.get("schema") != "evercraft.aiw.private-operations.v1"
                        or data.get("visibility") != "private_owner_only"
                        or data.get("public_release_ready") is not False):
                        raise ValueError("Untrusted status receipt")
                    return self.send_bytes(200, raw, "application/json; charset=utf-8")
                except (OSError, ValueError, json.JSONDecodeError):
                    body = json.dumps({"status": "unavailable", "message": "Private status not verified"}).encode()
                    return self.send_bytes(503, body, "application/json; charset=utf-8")
            return self.send_bytes(404, b"Not found", "text/plain; charset=utf-8")

        def do_POST(self):
            return self.send_bytes(405, b"Read only", "text/plain; charset=utf-8")

        def do_PUT(self):
            return self.do_POST()

        def do_DELETE(self):
            return self.do_POST()

        def log_message(self, fmt, *args):
            pass  # Do not log paths or viewer activity by default.

    return Viewer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", default=str(Path(__file__).resolve().parents[1] / "operator" / "private-operations.html"))
    parser.add_argument("--status", required=True, help="Private status export; never source collector raw receipts")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a non-privileged port")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler(args.html, args.status))
    print("AIW private viewer on http://127.0.0.1:%d (loopback ONLY)" % args.port, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
