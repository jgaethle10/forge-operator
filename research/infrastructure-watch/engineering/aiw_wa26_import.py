#!/usr/bin/env python3
"""Import pinned FHWA 2026 Washington SNBI JSON to a separate, immutable SQLite index.

Does not touch existing regional bridges2026.sqlite or production services.
Bridge condition is an official historical classification, never an emergency
or road-open determination. Missing county and bridge name remain NULL.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile

SOURCE_SHA256 = "c97fb57339f8f7bd9ae82cb807814443fb7cd8bb9fb99c45adc74f2ae3912c79"
SOURCE_URL = "https://www.fhwa.dot.gov/bridge/nbi/2026/JSON/WA26.json"
EXPECTED_COUNTS = {"G": 4298, "F": 3918, "P": 403}
EXPECTED_ROWS = 8619
# Audited out-of-state coordinate in the official Washington submission.
# Keep the bridge, but do not treat its position as verified for Washington maps.
EXPECTED_COORDINATE_EXCEPTIONS = {
    "0000P06117B1804": (43.4365, -123.896469),
}


def classification(record):
    values = []
    for key in ("BC01", "BC02", "BC03", "BC04"):
        value = str(record.get(key, "")).strip()
        if len(value) == 1 and value in "0123456789":
            values.append(int(value))
        elif value not in ("", "N"):
            raise ValueError("Unexpected component condition rating")
    if not values:
        return None
    return "P" if min(values) <= 4 else "F" if min(values) <= 6 else "G"


def validate(source):
    raw = Path(source).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError("Official Washington source SHA-256 differs from pinned version")
    rows = json.loads(raw)
    if not isinstance(rows, list) or len(rows) != EXPECTED_ROWS or any(not isinstance(r, dict) for r in rows):
        raise ValueError("Unexpected Washington record structure or count")
    seen = set()
    out = []
    counts = Counter()
    county_missing = 0
    coord_invalid = 0
    flagged_coordinates = {}
    names_missing = 0
    for row in rows:
        ident = row.get("BID01")
        if not isinstance(ident, str) or not ident.strip() or ident in seen:
            raise ValueError("Missing or repeated bridge identifier")
        seen.add(ident)
        if str(row.get("BL01")) != "53":
            raise ValueError("State identifier is not Washington (53)")
        official = row.get("BC12")
        derived = classification(row)
        if official not in ("G", "F", "P") or official != derived:
            raise ValueError("Official/derived condition mismatch")
        latitude, longitude = row.get("BL05"), row.get("BL06")
        if isinstance(latitude, bool) or isinstance(longitude, bool) or not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
            raise ValueError("Unexpected coordinate types")
        if not (45.0 <= latitude <= 50.0 and -125.0 <= longitude <= -116.0):
            coord_quality = "review_outside_wa_bbox"
            coord_invalid += 1
            flagged_coordinates[ident] = (latitude, longitude)
        else:
            coord_quality = "numeric_within_wa_bbox_not_geodetically_verified"
        county = row.get("BL02")
        if county is not None:
            if isinstance(county, bool) or not isinstance(county, int):
                raise ValueError("Unexpected county code type")
            county = str(county)
        else:
            county_missing += 1
        name = row.get("BID02")
        if name is not None and not isinstance(name, str):
            raise ValueError("Unexpected bridge name type")
        if not name:
            name = None
            names_missing += 1
        inspections = row.get("Inspections")
        if not isinstance(inspections, list):
            raise ValueError("Unexpected inspection collection")
        counts[official] += 1
        out.append((ident, name, official, county, latitude, longitude,
                    coord_quality, len(inspections)))
    if (dict(counts) != EXPECTED_COUNTS or county_missing != 556
        or flagged_coordinates != EXPECTED_COORDINATE_EXCEPTIONS):
        raise ValueError(f"Washington baseline mismatch: condition_counts={dict(counts)}, expected={EXPECTED_COUNTS}; county_missing={county_missing}, expected=556; outside_WA_bbox={flagged_coordinates}, expected={EXPECTED_COORDINATE_EXCEPTIONS}. No database was created.")
    return out, {"records": len(out), "condition_counts": dict(counts),
                 "missing_county": county_missing, "missing_bridge_name": names_missing,
                 "flagged_outside_wa_bbox": coord_invalid,
                 "flagged_bridge_ids": sorted(flagged_coordinates),
                 "mapped_coordinate_verification": "bounds_only_not_geodetic_or_safety",
                 "source_sha256": digest, "source_url": SOURCE_URL,
                 "snapshot_year": 2026,
                 "scope": "WA_only_not_national",
                 "emergency_feed": False, "current_road_status": False}


def build(source, destination):
    destination = Path(destination)
    if destination.exists():
        raise FileExistsError("Refusing to overwrite existing Washington database")
    rows, report = validate(source)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, tmp = tempfile.mkstemp(prefix=".wa26-index-", suffix=".sqlite", dir=destination.parent)
    os.close(fd)
    try:
        db = sqlite3.connect(tmp)
        try:
            db.execute("""CREATE TABLE bridges (
                state TEXT NOT NULL,
                bridge_id TEXT PRIMARY KEY,
                name TEXT,
                condition TEXT NOT NULL CHECK(condition IN ('G','F','P')),
                county_code TEXT,
                county_name TEXT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                coordinate_quality TEXT NOT NULL,
                source_url TEXT NOT NULL,
                inspection_entry_count INTEGER NOT NULL
            )""")
            db.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.executemany("""INSERT INTO bridges (
                state, bridge_id, name, condition, county_code, county_name,
                latitude, longitude, coordinate_quality, source_url, inspection_entry_count)
                VALUES ('WA',?,?,?,?,NULL,?,?,?, ?,?)""",
                [(ident, name, cond, county, lat, lon, qual, SOURCE_URL, inspections)
                 for (ident,name,cond,county,lat,lon,qual,inspections) in rows])
            report["built_at_utc"] = datetime.now(timezone.utc).isoformat()
            for key, value in report.items():
                db.execute("INSERT INTO metadata VALUES (?,?)",
                           (key, json.dumps(value, sort_keys=True)))
            db.commit()
            if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError("SQLite integrity check failed")
        finally:
            db.close()
        os.chmod(tmp, 0o600)
        # Atomic create-only: no data replacement, even under race conditions.
        os.link(tmp, destination)
    finally:
        Path(tmp).unlink(missing_ok=True)
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True)
    p.add_argument("--db", required=True)
    a = p.parse_args()
    report = build(a.source, a.db)
    print(json.dumps({"result": "PASS", "database": a.db, **report}, indent=2))


if __name__ == "__main__":
    main()
