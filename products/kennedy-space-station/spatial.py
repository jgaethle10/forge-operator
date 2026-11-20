"""Kennedy Space Station's owned, preliminary 2D spatial-study kernel.

Not a survey, site-plan compiler, zoning/ADA checker, permit drawing, or
georeferenced mapping product. Source coordinates are explicitly assumed.
"""
from contextlib import contextmanager
import datetime as dt
from html import escape
import hashlib
import json
import math
from pathlib import Path
import re
import secrets
import sqlite3

SCHEMA = "evercraft.kss.spatial-study.v1"
ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
KINDS = {"building", "pavement", "parking", "charging_bay", "equipment_pad", "path"}
COLORS = {
    "building": ("#d2d5e6", "#4e5885"),
    "pavement": ("#e2e7f0", "#a1adbd"),
    "parking": ("#c2d6fc", "#5b75ca"),
    "charging_bay": ("#a38bea", "#5035a5"),
    "equipment_pad": ("#ffda9a", "#ac722e"),
    "path": ("#b4e9db", "#238670"),
}


class StudyError(ValueError):
    pass


def text_field(value, name, limit, required=False):
    if not isinstance(value, str):
        raise StudyError(name + "_invalid")
    value = value.strip()
    if any((ord(c) < 32 and c not in "\t\n\r") or 0xD800 <= ord(c) <= 0xDFFF
           for c in value):
        raise StudyError(name + "_invalid_characters")
    if len(value) > limit or (required and not value):
        raise StudyError(name + "_invalid")
    return value


def dimension(value, name, maximum=5000, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise StudyError(name + "_must_be_numeric")
    if not math.isfinite(value) or not minimum < value <= maximum:
        raise StudyError(name + "_outside_bounds")
    rounded = round(float(value), 3)
    if rounded <= 0:
        raise StudyError(name + "_below_precision")
    return rounded


def coordinate(value, name):
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise StudyError(name + "_must_be_numeric")
    if not math.isfinite(value) or value < 0 or value > 5000:
        raise StudyError(name + "_outside_bounds")
    return round(float(value), 3)


def overlap(a, b):
    return (a["x"] < b["x"] + b["width"] and
            a["x"] + a["width"] > b["x"] and
            a["z"] < b["z"] + b["depth"] and
            a["z"] + a["depth"] > b["z"])


def validate(raw, site_id):
    if not isinstance(raw, dict) or raw.get("schema") != SCHEMA:
        raise StudyError("schema_invalid")
    if not ID.fullmatch(site_id):
        raise StudyError("site_id_invalid")
    if raw.get("units") != "meters":
        raise StudyError("meters_required")
    if raw.get("measurement_basis") not in ("assumed", "user_supplied"):
        raise StudyError("unverified_measurement_basis_required")
    parcel = raw.get("parcel")
    if not isinstance(parcel, dict):
        raise StudyError("parcel_required")
    parcel = {
        "width": dimension(parcel.get("width"), "parcel_width"),
        "depth": dimension(parcel.get("depth"), "parcel_depth")
    }
    shapes = raw.get("objects")
    if not isinstance(shapes, list) or not 1 <= len(shapes) <= 64:
        raise StudyError("object_count_invalid")
    seen = set()
    normalized = []
    for index, item in enumerate(shapes):
        if not isinstance(item, dict):
            raise StudyError("object_invalid")
        ident = text_field(item.get("id"), "object_id", 64, True)
        if not ID.fullmatch(ident) or ident in seen:
            raise StudyError("object_id_invalid_or_duplicate")
        seen.add(ident)
        kind = item.get("kind")
        if not isinstance(kind, str) or kind not in KINDS:
            raise StudyError("kind_invalid")
        shape = {
            "id": ident,
            "kind": kind,
            "label": text_field(item.get("label", ""), "label", 80),
            "x": coordinate(item.get("x"), "object_x"),
            "z": coordinate(item.get("z"), "object_z"),
            "width": dimension(item.get("width"), "object_width"),
            "depth": dimension(item.get("depth"), "object_depth"),
        }
        if shape["x"] + shape["width"] > parcel["width"] + 1e-9 or \
           shape["z"] + shape["depth"] > parcel["depth"] + 1e-9:
            raise StudyError("object_outside_parcel:" + ident)
        normalized.append(shape)
    # Conservative conflicts only: other overlapped conceptual layers can be intentional.
    for a in normalized:
        if a["kind"] not in ("charging_bay", "equipment_pad", "building"):
            continue
        for b in normalized:
            if a["id"] >= b["id"]:
                continue
            prohibited = (a["kind"] == "building" and b["kind"] in
                          ("building", "charging_bay", "equipment_pad")) or \
                         (b["kind"] == "building" and a["kind"] in
                          ("building", "charging_bay", "equipment_pad"))
            if prohibited and overlap(a, b):
                raise StudyError("building_footprint_conflict:" + a["id"] + ":" + b["id"])
    report_id = raw.get("source_report_id") or ""
    if not isinstance(report_id, str) or (report_id and not ID.fullmatch(report_id)):
        raise StudyError("source_report_id_invalid")
    return {
        "schema": SCHEMA,
        "site_id": site_id,
        "title": text_field(raw.get("title", ""), "title", 100, True),
        "units": "meters",
        "measurement_basis": raw["measurement_basis"],
        "source_note": text_field(raw.get("source_note", ""), "source_note", 400),
        "source_report_id": report_id,
        "parcel": parcel,
        "objects": normalized,
        "qa": {
            "parcel_bounds_checked": True,
            "building_footprint_conflicts_checked": True,
            "survey_verified": False,
            "georeferenced": False,
            "ada_compliance_verified": False,
            "engineering_approved": False,
            "construction_ready": False,
        },
    }


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


class SpatialStore:
    """Append-only studies, referencing canonical Site Planner site and report IDs."""
    def __init__(self, data_root):
        self.data_root = Path(data_root)
        self.path = self.data_root / "studies.sqlite3"

    @contextmanager
    def connect(self):
        self.data_root.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=15)
        try:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("PRAGMA journal_mode=WAL")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def init(self):
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS studies(
                id TEXT PRIMARY KEY, site_id TEXT NOT NULL,
                revision INTEGER NOT NULL, created_at TEXT NOT NULL,
                title TEXT NOT NULL, model_json TEXT NOT NULL,
                model_sha256 TEXT NOT NULL,
                UNIQUE(site_id,revision))""")
            db.execute("CREATE INDEX IF NOT EXISTS idx_kss_studies_site ON studies(site_id, revision)")
            db.execute("""CREATE TABLE IF NOT EXISTS kss_outbox(
                id TEXT PRIMARY KEY, site_id TEXT NOT NULL, study_id TEXT NOT NULL,
                event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
                payload_sha256 TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL)""")
            db.execute("CREATE INDEX IF NOT EXISTS idx_kss_outbox_state ON kss_outbox(state,created_at)")

    def save(self, site_id, model):
        normalized = validate(model, site_id)
        model_json = canonical_json(normalized)
        sha = digest(normalized)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            next_rev = db.execute(
                "SELECT COALESCE(MAX(revision),0)+1 FROM studies WHERE site_id=?",
                (site_id,)).fetchone()[0]
            study_id = "KSS-" + secrets.token_hex(10).upper()
            created = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
            db.execute(
                """INSERT INTO studies(id,site_id,revision,created_at,title,model_json,model_sha256)
                VALUES (?,?,?,?,?,?,?)""",
                (study_id, site_id, next_rev, created, normalized["title"], model_json, sha)
            )
            event = {"site_id": site_id, "study_id": study_id,
                     "revision": next_rev, "model_sha256": sha,
                     "source_report_id": normalized["source_report_id"],
                     "evidence_basis": normalized["measurement_basis"],
                     "engineering_authority": False}
            event_json = canonical_json(event)
            db.execute(
                """INSERT INTO kss_outbox
                (id,site_id,study_id,event_type,payload_json,payload_sha256,state,created_at)
                VALUES (?,?,?,?,?,?,?,?)""",
                ("EVENT-KSS-" + secrets.token_hex(10).upper(), site_id, study_id,
                 "kss.spatial.study.saved.v1", event_json, digest(event),
                 "pending", created))
        return {"id": study_id, "site_id": site_id, "revision": next_rev,
                "created_at": created, "title": normalized["title"],
                "model_sha256": sha, "source_report_id": normalized["source_report_id"]}

    def list(self, site_id):
        with self.connect() as db:
            return [dict(row) for row in db.execute(
                """SELECT id,site_id,revision,created_at,title,model_sha256
                FROM studies WHERE site_id=? ORDER BY revision DESC""", (site_id,))]

    def outbox(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute(
                """SELECT id,site_id,study_id,event_type,payload_sha256,state,created_at
                FROM kss_outbox ORDER BY created_at,id""")]

    def get(self, site_id, study_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM studies WHERE site_id=? AND id=?",
                             (site_id, study_id)).fetchone()
        if row is None:
            raise StudyError("study_not_found")
        item = dict(row)
        item["model"] = json.loads(item.pop("model_json"))
        return item


def svg(study):
    """Source-bound SVG, with non-engineering and no-georeference stamps."""
    model = study["model"]
    parcel = model["parcel"]
    width, depth = parcel["width"], parcel["depth"]
    scale = min(890 / width, 565 / depth)
    left = (1100 - width * scale) / 2
    top = 80 + (580 - depth * scale) / 2
    title = escape(model["title"])
    site_id = escape(model["site_id"])
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="780" viewBox="0 0 1100 780">',
        '<rect width="1100" height="780" fill="#f6f7fc"/>',
        '<text x="54" y="48" font-size="26" font-weight="800" fill="#24214f">KENNEDY SPACE STATION | CONCEPT STUDY</text>',
        f'<rect x="{left:.2f}" y="{top:.2f}" width="{width*scale:.2f}" height="{depth*scale:.2f}" fill="#eef5ec" stroke="#647c72" stroke-width="2" stroke-dasharray="7 5"/>']
    for shape in model["objects"]:
        fill, stroke = COLORS[shape["kind"]]
        x = left + shape["x"] * scale
        y = top + shape["z"] * scale
        w = shape["width"] * scale
        h = shape["depth"] * scale
        lines.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" fill="{fill}" fill-opacity=".85" stroke="{stroke}" stroke-width="2"/>')
        if w > 42 and h > 18:
            label = escape(shape["label"] or shape["kind"].replace("_", " ").title())
            lines.append(f'<text x="{x+w/2:.2f}" y="{y+h/2:.2f}" text-anchor="middle" font-size="12" font-weight="700" fill="#2c3153">{label}</text>')
    lines.extend([
        '<rect x="0" y="675" width="1100" height="105" fill="#251c56"/>',
        f'<text x="50" y="711" font-size="17" fill="#ffffff">{title} | Site: {site_id} | Revision {study["revision"]}</text>',
        f'<text x="50" y="735" font-size="12" fill="#c2b9f2">Units: meters | Boundary: user-entered | Basis: {escape(model["measurement_basis"])} | Not georeferenced</text>',
        '<text x="50" y="757" font-size="12" fill="#ffd8a1">PRELIMINARY CONCEPT ONLY. NOT A SURVEY, CODE CHECK, PERMIT OR CONSTRUCTION PLAN.</text>',
        f'<desc>Canonical model SHA-256: {escape(study["model_sha256"])}</desc>',
        '</svg>'
    ])
    return "\n".join(lines).encode("utf-8")
