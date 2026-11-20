#!/usr/bin/env python3
"""Kennedy Space Station product front door over the separate Evercraft Site Planner.

Operator-only integration shell. This is neither a paid membership portal nor
an operational site-plan solver. The Site Planner product owns the site/report API.
"""
import importlib.util
import hashlib
import json
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
    """Confirm scope against the canonical Site Planner database."""
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


def report_context(site_id, report_id):
    """Minimum report lineage and user-recorded evidence counts, never spatial truth."""
    validate_site_and_report(site_id)
    if not spatial.ID.fullmatch(report_id):
        raise spatial.StudyError("report_id_invalid")
    with site_planner.connect() as db:
        row = db.execute("""SELECT id,site_id,created_at,snapshot_json,evidence_count,
                                   scenario_count FROM reports WHERE site_id=? AND id=?""",
                         (site_id, report_id)).fetchone()
    if row is None:
        raise LookupError("report_not_found_in_site")
    source = row["snapshot_json"]
    try:
        parsed = json.loads(source)
        if not isinstance(parsed, dict) or parsed.get("site", {}).get("id") != site_id:
            raise ValueError("site mismatch")
        evidence = parsed.get("evidence", [])
        if not isinstance(evidence, list):
            raise ValueError("evidence malformed")
        counts = {"verified": 0, "unverified": 0, "assumption": 0, "other": 0}
        for item in evidence:
            if not isinstance(item, dict):
                raise ValueError("evidence malformed")
            state = item.get("status")
            counts[state if isinstance(state, str) and state in counts else "other"] += 1
        if sum(counts.values()) != row["evidence_count"]:
            raise ValueError("evidence count mismatch")
    except (TypeError, ValueError, AttributeError):
        raise spatial.StudyError("source_snapshot_invalid")
    return {
        "schema": "evercraft.kss.report-context.v1",
        "site_id": site_id,
        "report_id": row["id"],
        "created_at": row["created_at"],
        "snapshot_sha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "evidence_counts": counts,
        "scenario_count": row["scenario_count"],
        "evidence_status_authority": "site_planner_operator_recorded_not_independently_verified",
        "spatial_ground_truth": False,
    }


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
        m = re.fullmatch(r"/api/kss/sites/([A-Za-z0-9_-]+)/reports/([A-Za-z0-9_-]+)/context", path)
        if m:
            if not self.authorized():
                return
            try:
                return self.send(200, report_context(m.group(1), m.group(2)))
            except LookupError as exc:
                return self.bad(str(exc), 404)
            except spatial.StudyError as exc:
                return self.bad(str(exc), 422)
            except sqlite3.Error:
                return self.bad("source_report_unavailable", 500)
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
            receipt = (report_context(site_id, normalized["source_report_id"])
                       if normalized["source_report_id"] else None)
            result = SPATIAL.save(site_id, normalized, report_receipt=receipt)
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
    # The current site-data API is operator-wide, not tenant-scoped. A single
    # shared bearer token does NOT make it safe on the public internet.
    # Owned HTTPS + authentication may terminate at a local reverse proxy.
    if bind not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("KSS_PRIVATE_PREVIEW: refusing non-loopback binding")
    if site_planner.TOKEN:
        raise SystemExit("KSS_PRIVATE_PREVIEW: browser cannot use shared bearer token; "
                         "keep it unset and authenticate at the owned HTTPS gateway")
    print(f"Kennedy Space Station private preview at http://{bind}:{PORT}", flush=True)
    ThreadingHTTPServer((bind, PORT), KennedyHandler).serve_forever()


if __name__ == "__main__":
    serve()
