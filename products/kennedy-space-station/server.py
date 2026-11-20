#!/usr/bin/env python3
"""Kennedy Space Station product front door over the separate Evercraft Site Planner.

Operator-only integration shell. This is neither a paid membership portal nor
an operational site-plan solver. The Site Planner product owns the site/report API.
"""
import importlib.util
import os
from pathlib import Path
import sys
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
SITE_PLANNER_ROOT = ROOT.parent / "site-planner"
BACKEND_PATH = SITE_PLANNER_ROOT / "server.py"

# Load the canonical, separately maintained Site Planner backend in place.
# Do not duplicate its schema, migrate legacy Base44 code, or fork the API.
sys.path.insert(0, str(SITE_PLANNER_ROOT))
spec = importlib.util.spec_from_file_location("evercraft_site_planner_backend", BACKEND_PATH)
site_planner = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = site_planner
spec.loader.exec_module(site_planner)

PORT = int(os.environ.get("KENNEDY_PORT", "8811"))


class KennedyHandler(site_planner.Handler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ("/", "/home", "/home.html", "/workspace", "/api/health"):
            if not self.authorized():
                return
            if path == "/api/health":
                return self.send(200, {
                    "ok": True,
                    "product": "Kennedy Space Station",
                    "mode": "private-operator-preview",
                    "connected_product": "Evercraft Site Planner",
                    "spatial_rendering_integrated": False,
                    "membership_checkout_integrated": False,
                    "public_customer_access": False,
                })
            if path == "/workspace":
                return self.send(200, (SITE_PLANNER_ROOT / "index.html").read_bytes(),
                                 "text/html; charset=utf-8")
            return self.send(200, (ROOT / "index.html").read_bytes(),
                             "text/html; charset=utf-8")
        return super().do_GET()


def serve():
    site_planner.init()
    bind = site_planner.BIND
    if bind not in ("127.0.0.1", "localhost", "::1") and not site_planner.TOKEN:
        raise SystemExit("Refusing non-loopback Kennedy binding without EVERCRAFT_SITE_TOKEN")
    print(f"Kennedy Space Station private preview at http://{bind}:{PORT}", flush=True)
    ThreadingHTTPServer((bind, PORT), KennedyHandler).serve_forever()


if __name__ == "__main__":
    serve()
