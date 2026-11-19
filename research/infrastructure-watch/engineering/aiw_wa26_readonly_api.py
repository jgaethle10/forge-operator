#!/usr/bin/env python3
"""Private, read-only API for separately indexed FHWA 2026 Washington bridges.

Strictly binds localhost, never serves the raw source file, omits the one
flagged geographic coordinate from map results, and never implies live safety.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
from urllib.parse import parse_qs, urlsplit

CONDITIONS = {"P", "F", "G"}
EXPECTED_SHA = "c97fb57339f8f7bd9ae82cb807814443fb7cd8bb9fb99c45adc74f2ae3912c79"


def connect(db):
    # Immutable read-only, query-only database; must already be indexed.
    conn = sqlite3.connect(f"file:{Path(db).resolve().as_posix()}?mode=ro&immutable=1", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only=ON")
    return conn


def check_database(db):
    with connect(db) as conn:
        count = conn.execute("SELECT COUNT(*) FROM bridges").fetchone()[0]
        rows = dict(conn.execute("SELECT condition, COUNT(*) FROM bridges GROUP BY condition").fetchall())
        flagged = conn.execute("SELECT COUNT(*) FROM bridges WHERE coordinate_quality='review_outside_wa_bbox'").fetchone()[0]
        metadata = {r[0]: json.loads(r[1]) for r in conn.execute("SELECT key,value FROM metadata")}
    if (count != 8619 or rows != {"F": 3918, "G": 4298, "P": 403}
        or flagged != 1 or metadata.get("source_sha256") != EXPECTED_SHA
        or metadata.get("scope") != "WA_only_not_national"
        or metadata.get("emergency_feed") is not False):
        raise ValueError("Washington index evidence did not pass verification")


def handler(db):
    class API(BaseHTTPRequestHandler):
        def reply(self, status, obj):
            payload = json.dumps(obj, separators=(",", ":"), allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Access-Control-Allow-Origin", "null")  # No public cross-origin clients.
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path in ("/healthz", "/api/v1/coverage"):
                if url.query:
                    return self.reply(400, {"error": "unexpected_query"})
                return self.reply(200, {
                    "status": "ready", "state": "WA", "snapshot_year": 2026,
                    "records": 8619,
                    "condition_counts": {"G": 4298, "F": 3918, "P": 403},
                    "missing_county": 556, "flagged_coordinates": 1,
                    "source_sha256": EXPECTED_SHA,
                    "national_complete": False, "live_emergency_feed": False,
                    "current_road_status_verified": False,
                    "condition_is_not_imminent_danger": True,
                })
            if url.path == "/api/v1/bridges":
                args = parse_qs(url.query, strict_parsing=True, keep_blank_values=True)
                if set(args) - {"condition", "county", "limit", "offset", "mapped_only"} or any(len(v) != 1 for v in args.values()):
                    return self.reply(400, {"error": "invalid_query"})
                cond = args.get("condition", [None])[0]
                county = args.get("county", [None])[0]
                mapped_only = args.get("mapped_only", ["1"])[0]
                if cond is not None and cond not in CONDITIONS:
                    return self.reply(400, {"error": "invalid_condition"})
                if county is not None and (not county.isdigit() or len(county) > 3):
                    return self.reply(400, {"error": "invalid_county"})
                if mapped_only not in ("0", "1"):
                    return self.reply(400, {"error": "invalid_mapped_only"})
                try:
                    limit = int(args.get("limit", ["100"])[0])
                    offset = int(args.get("offset", ["0"])[0])
                except ValueError:
                    return self.reply(400, {"error": "invalid_pagination"})
                if not (1 <= limit <= 200 and 0 <= offset <= 10000):
                    return self.reply(400, {"error": "pagination_out_of_range"})
                clauses, params = [], []
                if cond is not None:
                    clauses.append("condition=?"); params.append(cond)
                if county is not None:
                    clauses.append("county_code=?"); params.append(str(int(county)))
                if mapped_only == "1":
                    clauses.append("coordinate_quality!='review_outside_wa_bbox'")
                where = " WHERE " + " AND ".join(clauses) if clauses else ""
                with connect(db) as connection:
                    total = connection.execute("SELECT COUNT(*) FROM bridges" + where, params).fetchone()[0]
                    items = [dict(x) for x in connection.execute(
                        "SELECT bridge_id,name,condition,county_code,latitude,longitude,coordinate_quality,inspection_entry_count "
                        "FROM bridges" + where + " ORDER BY bridge_id LIMIT ? OFFSET ?", params + [limit,offset])]
                return self.reply(200, {
                    "scope": "WA_2026_only", "source_sha256": EXPECTED_SHA,
                    "historical_condition_not_live_safety": True,
                    "mapped_only": mapped_only == "1",
                    "total_matches": total, "returned": len(items),
                    "offset": offset, "bridges": items,
                })
            return self.reply(404, {"error": "not_found"})

        def do_POST(self):
            return self.reply(405, {"error": "read_only"})
        do_PUT = do_POST
        do_PATCH = do_POST
        do_DELETE = do_POST

        def log_message(self, *_):
            pass

    return API


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", required=True)
    p.add_argument("--port", type=int, default=8788)
    a = p.parse_args()
    if not 1024 <= a.port <= 65535:
        p.error("port must be between 1024 and 65535")
    check_database(a.db)
    server = ThreadingHTTPServer(("127.0.0.1", a.port), handler(a.db))
    print(f"Private Washington 2026 API listening on 127.0.0.1:{a.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
