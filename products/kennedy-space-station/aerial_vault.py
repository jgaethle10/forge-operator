"""Private, append-only Kennedy aerial source vault.

Operator-only staging. Original PNG bytes + operator-attested provenance and
pixel/local-metre calibration are preserved together in one SQLite transaction.
No fetched map tiles, public delivery, professional review, real-image PDF
rendering, or customer tenancy. Privileged owner only on loopback.
"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import secrets
import sqlite3

import raster_registration as reg
import sheet_compiler

SCHEMA = "evercraft.kss.aerial-source.v1"
ROLES = frozenset(("site", "context"))
MAX_IMAGE_BYTES = 5 * 1024 * 1024

class SourceError(ValueError):
    pass


def canonical(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


class AerialVault:
    def __init__(self, root):
        self.root = Path(root)
        self.db_path = self.root / "aerial-vault.sqlite3"

    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=15000")
        return db

    def init(self):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS sources(
                    id TEXT PRIMARY KEY,
                    site_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('site','context')),
                    created_at TEXT NOT NULL,
                    image_sha256 TEXT NOT NULL,
                    source_receipt_json TEXT NOT NULL,
                    source_receipt_sha256 TEXT NOT NULL,
                    image_bytes BLOB NOT NULL
                );
                CREATE INDEX IF NOT EXISTS sources_by_site ON sources(site_id,created_at,id);
                CREATE TABLE IF NOT EXISTS source_events(
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL REFERENCES sources(id),
                    site_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    event_payload TEXT NOT NULL,
                    event_sha256 TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state='pending'),
                    created_at TEXT NOT NULL
                );
            """)
            db.commit()

    @staticmethod
    def validate_role(role):
        if not isinstance(role, str) or role not in ROLES:
            raise SourceError("role_site_or_context_required")
        return role

    def save(self, site_id, role, manifest, image):
        """Caller must separately validate that site exists in Site Planner.

        The audit record stores the full original bytes, the exact registration
        manifest, deterministic image hash and immutable, non-public receipt.
        """
        if not reg.require_text(site_id, "site_id", 64):
            raise SourceError("site_id_required")
        self.validate_role(role)
        if not isinstance(image, bytes) or len(image) > MAX_IMAGE_BYTES:
            raise SourceError("image_missing_or_over_5mb")
        if not isinstance(manifest, dict) or manifest.get("site_id") != site_id:
            raise SourceError("manifest_site_mismatch")
        # Registration validates source hash, dimensions, asserted rights and
        # operator control points. This does not independently verify a license.
        receipt = reg.register_image(manifest, image)
        # Confirm every PNG chunk, supported RGB8 pixel format and bounded
        # decompression. A mere PNG header is insufficient for source storage.
        sheet_compiler.decode_rgb_png(image)
        source_id = "AIR-" + secrets.token_hex(10).upper()
        created = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        source_receipt = {
            "schema": SCHEMA,
            "source_id": source_id, "site_id": site_id, "role": role,
            "created_at": created, "image_sha256": receipt["image_sha256"],
            "image_size_bytes": len(image),
            "registration": receipt,
            "input_manifest_sha256": hashlib.sha256(canonical(manifest).encode()).hexdigest(),
            "review_state": "pending_independent_rights_and_geographic_qa",
            "real_site_sheet_export_authorized": False,
            "public_access_authorized": False,
            "customer_access_authorized": False,
            "georeferenced": False,
            "engineering_authority": False,
        }
        record_json = canonical(source_receipt)
        record_digest = hashlib.sha256(record_json.encode()).hexdigest()
        event_payload = canonical({
            "site_id": site_id, "source_id": source_id,
            "role": role, "image_sha256": receipt["image_sha256"],
            "source_receipt_sha256": record_digest,
            "publication_authority": False,
        })
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("""INSERT INTO sources
                (id,site_id,role,created_at,image_sha256,source_receipt_json,
                 source_receipt_sha256,image_bytes)
                 VALUES (?,?,?,?,?,?,?,?)""",
                 (source_id,site_id,role,created,receipt["image_sha256"],
                  record_json,record_digest,sqlite3.Binary(image)))
            db.execute("""INSERT INTO source_events
                 (id,source_id,site_id,event_type,event_payload,event_sha256,state,created_at)
                 VALUES (?,?,?,?,?,?,?,?)""",
                 ("EV-AIR-" + secrets.token_hex(10).upper(),source_id,site_id,
                 "kss.aerial.source.staged.v1",event_payload,
                 hashlib.sha256(event_payload.encode()).hexdigest(),
                 "pending",created))
            db.commit()
        return {**source_receipt, "source_receipt_sha256":record_digest}

    def list(self,site_id):
        with self.connect() as db:
            rows=db.execute("""SELECT source_receipt_json,source_receipt_sha256
                FROM sources WHERE site_id=? ORDER BY created_at DESC,id DESC""",
                (site_id,)).fetchall()
        return [{**json.loads(row["source_receipt_json"]),
                 "source_receipt_sha256":row["source_receipt_sha256"]} for row in rows]

    def get(self,site_id,source_id,include_bytes=False):
        with self.connect() as db:
            row=db.execute("""SELECT source_receipt_json,source_receipt_sha256,
                              image_bytes,image_sha256 FROM sources
                              WHERE site_id=? AND id=?""",
                           (site_id,source_id)).fetchone()
        if row is None:
            raise LookupError("aerial_source_not_found_in_site")
        receipt=json.loads(row["source_receipt_json"])
        actual_receipt_sha=hashlib.sha256(row["source_receipt_json"].encode()).hexdigest()
        if actual_receipt_sha != row["source_receipt_sha256"]:
            raise SourceError("aerial_receipt_integrity_failed")
        if include_bytes:
            blob=bytes(row["image_bytes"])
            if hashlib.sha256(blob).hexdigest() != row["image_sha256"]:
                raise SourceError("aerial_bytes_integrity_failed")
            return receipt,blob
        return {**receipt,"source_receipt_sha256":actual_receipt_sha}
