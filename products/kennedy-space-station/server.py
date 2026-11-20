#!/usr/bin/env python3
"""Kennedy Space Station product front door over the separate Evercraft Site Planner.

Operator-only integration shell. This is neither a paid membership portal nor
an operational site-plan solver. The Site Planner product owns the site/report API.
"""
import importlib.util
import os
import re
import sqlite3
from pathlib import Path
import sys
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
import spatial

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
SPATIAL = spatial.SpatialStore(Path(os.environ.get("KENNEDY_DATA", str(site_planner.DATA / "kennedy"))))


def validate_site_and_report(site_id, source_report_id=""):
    if not spatial.ID.fullmatch(site_id):
        raise spatial.StudyError("site_id_invalid")
    with site_planner.connect() as db:
        site = db.execute("SELECT id FROM sites WHERE id=?", (site_id,)).fetchone()
        if site is None:
            raise LookupError("site_not_found")
        if source_report_id:
            row = db.execute("SELECT id FROM reports WHERE id=? AND site_id=?",
                             (source_report_id, site_id)).fetchone()
            if row is None:
                raise spatial.StudyError("source_report_not_owned_by_site")



class KennedyHandler(site_planner.Handler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ("/", "/home", "/home.html", "/studio", "/workspace", "/api/health"):
            if not self.authorized():
                return
            if path == "/api/health":
                return self.send(200, {
                    "ok": True,
                    "product": "Kennedy Space Station",
                    "mode": "private-operator-preview",
                    "connected_product": "Evercraft Site Planner",
                    "preliminary_2d_studies": True,
                    "spatial_rendering_integrated": False,
                    "membership_checkout_integrated": False,
                    "public_customer_access": False,
                })
            if path == "/workspace":
                return self.send(200, (SITE_PLANNER_ROOT / "index.html").read_bytes(),
                                 "text/html; charset=utf-8")
            if path == "/studio":
                return self.send(200, (ROOT / "studio.html").read_bytes(),
                                 "text/html; charset=utf-8")
            return self.send(200, (ROOT / "index.html").read_bytes(),
                             "text/html; charset=utf-8")
        if path == "/api/kss/outbox":
            if not self.authorized():
                return
            try:
                return self.send(200, SPATIAL.outbox())
            except sqlite3.Error:
                return self.bad("spatial_store_unavailable", 500)
        m = re.fullmatch(r"/api/kss/sites/([A-Za-z0-9_-]+)/studies(?:/([A-Za-z0-9_-]+)(/svg)?)?", path)
        if m:
            if not self.authorized():
                return
            site_id, study_id, svg_suffix = m.groups()
            try:
                validate_site_and_report(site_id)
                if study_id:
                    study = SPATIAL.get(site_id, study_id)
                    if svg_suffix:
                        return self.send(200, spatial.svg(study),
                                         "image/svg+xml; charset=utf-8",
                                         {"Content-Disposition":
                                          f'attachment; filename="kennedy-{study_id}.svg"'})
                    return self.send(200, study)
                return self.send(200, SPATIAL.list(site_id))
            except LookupError as exc:
                return self.bad(str(exc), 404)
            except spatial.StudyError as exc:
                return self.bad(str(exc), 404 if str(exc) == "study_not_found" else 400)
            except sqlite3.Error:
                return self.bad("spatial_store_unavailable", 500)
        return super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        m = re.fullmatch(r"/api/kss/sites/([A-Za-z0-9_-]+)/studies", path)
        if not m:
            return super().do_POST()
        if not self.authorized():
            return
        try:
            site_id = m.group(1)
            raw = self.body()
            normalized = spatial.validate(raw, site_id)
            validate_site_and_report(site_id, normalized["source_report_id"])
            result = SPATIAL.save(site_id, normalized)
            return self.send(201, result)
        except LookupError as exc:
            return self.bad(str(exc), 404)
        except (spatial.StudyError, ValueError) as exc:
            return self.bad(str(exc), 400)
        except sqlite3.Error:
            return self.bad("spatial_store_unavailable", 500)


def serve():
    site_planner.init()
    SPATIAL.init()
    bind = site_planner.BIND
    if bind not in ("127.0.0.1", "localhost", "::1") and not site_planner.TOKEN:
        raise SystemExit("Refusing non-loopback Kennedy binding without EVERCRAFT_SITE_TOKEN")
    print(f"Kennedy Space Station private preview at http://{bind}:{PORT}", flush=True)
    ThreadingHTTPServer((bind, PORT), KennedyHandler).serve_forever()


if __name__ == "__main__":
    serve()
