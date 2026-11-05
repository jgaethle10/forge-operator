#!/usr/bin/env python3
"""Local-only, read-only preview server for Fungal Defense Observatory v0.2.

Run from the checked-out branch:
    python3 research/fungal-defense-001/tools/serve_local.py

Only listens on 127.0.0.1 and only serves the versioned static HTML page.
No remote deployment, external services, patient data, or authentication.
"""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
PAGE = "observatory-v0.2.html"


class PreviewHandler(SimpleHTTPRequestHandler):
    """Prevent file listing and access to unrelated repository files."""

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/" + PAGE)
            self.end_headers()
            return
        if path != "/" + PAGE:
            self.send_error(404, "Preview only serves the observatory page")
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if urlsplit(self.path).path != "/" + PAGE:
            self.send_error(404, "Preview only serves the observatory page")
            return
        super().do_HEAD()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self'; connect-src 'none'; "
            "form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
        )
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        # Loopback-only service; keep logs free of URLs with user query parameters.
        print("[local-preview]", format % args)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=0, help="loopback port (0 picks available port)")
    args = ap.parse_args()
    if not 0 <= args.port <= 65535:
        ap.error("port must be between 0 and 65535")
    if not (ROOT / PAGE).is_file():
        ap.error(f"missing {ROOT / PAGE}; check out the research branch")
    handler = partial(PreviewHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Local preview: http://127.0.0.1:{server.server_port}/{PAGE}", flush=True)
        print("Only this computer can connect. Press Ctrl+C to stop.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
