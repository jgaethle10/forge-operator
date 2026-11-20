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

    def save(self, site_id, model, report_receipt=None):
        normalized = validate(model, site_id)
        report_id = normalized["source_report_id"]
        if report_id:
            # The HTTP operator must derive this receipt by reading canonical Site Planner
            # storage. The untrusted client's claimed receipt is never reused.
            if (not isinstance(report_receipt, dict) or
                report_receipt.get("schema") != "evercraft.kss.report-context.v1" or
                report_receipt.get("site_id") != site_id or
                report_receipt.get("report_id") != report_id or
                not isinstance(report_receipt.get("snapshot_sha256"), str) or
                not re.fullmatch(r"[a-f0-9]{64}", report_receipt["snapshot_sha256"])):
                raise StudyError("verified_report_receipt_required")
            normalized["source_report_receipt"] = {
                "schema": report_receipt["schema"],
                "site_id": report_receipt["site_id"],
                "report_id": report_receipt["report_id"],
                "created_at": report_receipt["created_at"],
                "snapshot_sha256": report_receipt["snapshot_sha256"],
                "evidence_counts": report_receipt["evidence_counts"],
                "scenario_count": report_receipt["scenario_count"],
                "evidence_status_authority": report_receipt["evidence_status_authority"],
                "spatial_ground_truth": False,
            }
        elif report_receipt is not None:
            raise StudyError("unexpected_report_receipt")
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
                "model_sha256": sha, "source_report_id": normalized["source_report_id"],
                "source_report_sha256": (normalized.get("source_report_receipt") or {}).get("snapshot_sha256") }

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


def pdf(study):
    """One-page, source-bound concept PDF using only Python's standard library.

    Not a certified plan or a measured/georeferenced drawing.
    """
    import unicodedata

    model = study["model"]
    parcel = model["parcel"]
    width, depth = parcel["width"], parcel["depth"]
    scale = min(650 / width, 355 / depth)
    left = (792 - width * scale) / 2
    bottom = 135 + (365 - depth * scale) / 2

    def pdf_text(value, limit=120):
        # Built-in PDF Helvetica does not embed a Unicode font. Degrade to
        # printable ASCII rather than emitting malformed non-WinAnsi text.
        normalized = unicodedata.normalize("NFKD", str(value))
        ascii_text = normalized.encode("ascii", "replace").decode("ascii")
        ascii_text = "".join(c if 32 <= ord(c) <= 126 else " " for c in ascii_text)
        return ascii_text[:limit].replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    def rgb(hex_value):
        return " ".join(f"{int(hex_value[i:i+2], 16)/255:.4f}" for i in (1, 3, 5))

    lines = []
    def shape_rect(x, y, w, h, fill, border=None):
        lines.append(f"{rgb(fill)} rg")
        if border:
            lines.append(f"{rgb(border)} RG")
            lines.append(f"{x:.3f} {y:.3f} {w:.3f} {h:.3f} re B")
        else:
            lines.append(f"{x:.3f} {y:.3f} {w:.3f} {h:.3f} re f")

    def label(x, y, value, size=10, bold=False, color="#272044"):
        lines.extend([
            f"{rgb(color)} rg",
            f"BT /{'F2' if bold else 'F1'} {size:.2f} Tf "
            f"{x:.3f} {y:.3f} Td ({pdf_text(value)}) Tj ET"
        ])

    # Header, source-bound central plan, footer banner.
    shape_rect(0, 0, 792, 612, "#f7f7fc")
    shape_rect(0, 546, 792, 66, "#251c56")
    label(35, 574, "KENNEDY SPACE STATION | PRELIMINARY STUDY", 18, True, "#ffffff")
    label(35, 555, "REAL USER-ENTERED GEOMETRY, NOT A SURVEY OR ENGINEERING DOCUMENT", 9, False, "#e5dcff")
    shape_rect(30, 122, 732, 402, "#ffffff", "#e3e4f0")
    shape_rect(left, bottom, width * scale, depth * scale, "#ebf5ec", "#698c77")
    for obj in model["objects"]:
        x = left + obj["x"] * scale
        y = bottom + (depth - obj["z"] - obj["depth"]) * scale
        w, h = obj["width"] * scale, obj["depth"] * scale
        fill, stroke = COLORS[obj["kind"]]
        shape_rect(x, y, w, h, fill, stroke)
        if w >= 80 and h >= 26:
            label(x + 4, y + h/2, obj["label"] or obj["kind"].replace("_", " "), 8, True)
    label(35, 508, f"{model['title']}", 13, True, "#28204f")
    label(35, 491, f"Parcel: {width:g} x {depth:g} m | Basis: {model['measurement_basis']} | Revision: {study['revision']}", 9, False, "#5e6682")
    shape_rect(0, 0, 792, 111, "#251c56")
    label(30, 87, f"Site: {model['site_id']}  |  Model SHA-256: {study['model_sha256']}", 8, True, "#ffffff")
    report = model.get("source_report_receipt")
    if report:
        label(30, 69, f"Origin report: {report['report_id']}  |  Snapshot: {report['snapshot_sha256']}", 8, False, "#d6caff")
    else:
        label(30, 69, "Origin report: none; geometry is not source-verified", 8, False, "#d6caff")
    label(30, 47, "PRELIMINARY CONCEPT ONLY - NOT A SURVEY, PERMIT OR CONSTRUCTION PLAN.", 11, True, "#ffd9a5")
    label(30, 31, "No ADA, utilities, drainage, traffic, code or property boundaries independently verified.", 8, False, "#dfd8f4")

    content = ("\n".join(lines) + "\n").encode("ascii")
    # Minimal deterministic PDF 1.4 writer: two built-in fonts + one page.
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] "
        b"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" +
        content + b"endstream",
    ]
    output = bytearray(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
    offsets = [0]
    for index, body in enumerate(objects, 1):
        offsets.append(len(output))
        output += f"{index} 0 obj\n".encode("ascii") + body + b"\nendobj\n"
    xref = len(output)
    output += f"xref\n0 {len(objects)+1}\n".encode("ascii")
    output += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        output += f"{offset:010d} 00000 n \n".encode("ascii")
    output += (f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\n"
               f"startxref\n{xref}\n%%EOF\n").encode("ascii")
    return bytes(output)


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
