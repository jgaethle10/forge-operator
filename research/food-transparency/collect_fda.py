#!/usr/bin/env python3
"""FOOD-TRANSPARENCY-001: read-only, one-page FDA enforcement canary."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request

URL = "https://api.fda.gov/food/enforcement.json?sort=report_date:desc&limit=100"
DOC = "https://open.fda.gov/apis/food/enforcement/"
MAX_BYTES = 8 * 1024 * 1024

def sha(data):
    return hashlib.sha256(data).hexdigest()

def normalize(raw):
    obj = json.loads(raw)
    rows = obj.get("results")
    if not isinstance(rows, list) or not rows or any(not isinstance(r, dict) for r in rows):
        raise ValueError("missing or invalid results; no successful receipt")
    if any(not isinstance(r.get("recall_number"), str) or not r["recall_number"] for r in rows):
        raise ValueError("missing recall identifiers")
    keys = ("recall_number", "event_id", "report_date", "recall_initiation_date",
            "classification", "status", "recalling_firm", "product_description",
            "reason_for_recall", "code_info", "distribution_pattern", "country", "state")
    return obj.get("meta", {}), [{k: r.get(k) for k in keys} for r in rows]

def write_once(path, data):
    # Publish a complete file atomically, never replace existing evidence.
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        try:
            os.link(name, path)
        except FileExistsError:
            if path.read_bytes() != data:
                raise ValueError("existing evidence mismatch")
    finally:
        os.unlink(name)

def encoded(obj):
    return (json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()

def collect(root, raw, source, retrieved_at):
    meta, rows = normalize(raw)
    digest = sha(raw)
    normalized = encoded({"records": rows, "scope": "one page, not exhaustive", "source_sha256": digest})
    receipt = {"mission": "FOOD-TRANSPARENCY-001", "source": source,
               "documentation": DOC, "retrieved_at_utc": retrieved_at,
               "source_last_updated": meta.get("last_updated"),
               "source_reported_total": meta.get("results", {}).get("total"),
               "records": len(rows), "raw_sha256": digest, "normalized_sha256": sha(normalized),
               "scope": "one page ordered by report_date; not complete recall coverage",
               "publication": "held", "status": "collection_success"}
    write_once(root / "raw" / (digest + ".json"), raw)
    write_once(root / "normalized" / (sha(normalized) + ".json"), normalized)
    data = encoded(receipt)
    write_once(root / "receipts" / (sha(data) + ".json"), data)
    return receipt

def self_test():
    raw = encoded({"meta": {"last_updated": "fixture", "results": {"total": 2}},
                   "results": [{"recall_number": "FIXTURE-1", "code_info": "lot A"},
                               {"recall_number": "FIXTURE-2", "status": "fixture"}]})
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        a = collect(root, raw, "fixture", "fixture")
        b = collect(root, raw, "fixture", "fixture")
        assert a == b and a["records"] == 2
        assert len(list((root / "raw").glob("*.json"))) == 1
        assert len(list((root / "receipts").glob("*.json"))) == 1
        assert (root / "raw" / (sha(raw) + ".json")).read_bytes() == raw
        _, rows = normalize(raw)
        assert rows[0]["classification"] is None and rows[0]["code_info"] == "lot A"
        try:
            normalize(b'{"results":[]}')
        except ValueError:
            pass
        else:
            raise AssertionError("empty response accepted")
        try:
            write_once(root / "raw" / (sha(raw) + ".json"), b"bad")
        except ValueError:
            pass
        else:
            raise AssertionError("evidence overwritten")
    print("FOOD_TRANSPARENCY_SELF_TEST PASS")

def main():
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--self-test", action="store_true")
    p.add_argument("--live", action="store_true")
    p.add_argument("--output", type=Path, default=Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state")) / "evercraft-food-transparency")
    args = p.parse_args()
    if args.self_test == args.live:
        p.error("choose exactly one of --self-test or --live")
    if args.self_test:
        self_test()
        return
    request = urllib.request.Request(URL, headers={"User-Agent": "EvercraftFoodTransparency/0.1", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("response exceeded byte limit")
    retrieved = dt.datetime.now(dt.timezone.utc).isoformat()
    print(json.dumps(collect(args.output, raw, URL, retrieved), indent=2))

if __name__ == "__main__":
    main()
