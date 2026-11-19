#!/usr/bin/env python3
"""Validate and persist American Infrastructure Watch source-cycle receipts.

A real collector must supply observations. This validator does not schedule
checks, fetch source pages, or authenticate content from an agency.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$")
SHA = re.compile(r"^[0-9a-f]{64}$")
RESULTS = {"ok", "failed", "unavailable", "skipped"}
MAX_INPUT = 256_000


def timestamp(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError("Timestamps must be UTC with a Z suffix")
    try:
        out = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as e:
        raise ValueError("Invalid UTC timestamp") from e
    if out.utcoffset().total_seconds() != 0:
        raise ValueError("Non-UTC timestamp")
    return out


def source_registry(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) != {"sources"} or not isinstance(data["sources"], list):
        raise ValueError("Registry must contain sources array")
    sources = {}
    for s in data["sources"]:
        if not isinstance(s, dict) or set(s) != {"id", "url"}:
            raise ValueError("Each source needs id and url")
        sid, url = s["id"], s["url"]
        if not isinstance(sid, str) or not ID.fullmatch(sid) or sid in sources:
            raise ValueError("Invalid or duplicate source ID")
        if not isinstance(url, str) or not url.startswith("https://") or len(url) > 2048:
            raise ValueError("Source URL must use HTTPS")
        sources[sid] = url
    if not 1 <= len(sources) <= 50:
        raise ValueError("Registry must have 1 to 50 distinct sources")
    return sources


def validate_cycle(data, sources):
    required = {"cycle_id", "collector_id", "started_at", "finished_at", "sources"}
    if not isinstance(data, dict) or set(data) != required:
        raise ValueError("Unexpected cycle schema")
    for key in ("cycle_id", "collector_id"):
        if not isinstance(data[key], str) or not ID.fullmatch(data[key]):
            raise ValueError("Invalid identifier")
    start, finish = timestamp(data["started_at"]), timestamp(data["finished_at"])
    if not start <= finish or (finish - start).total_seconds() > 3600:
        raise ValueError("Cycle times out of order or over 1 hour")
    if finish > datetime.now(timezone.utc):
        raise ValueError("Future cycle receipts are not valid")
    if not isinstance(data["sources"], list):
        raise ValueError("Cycle sources must be a list")
    found = {}
    for item in data["sources"]:
        if not isinstance(item, dict):
            raise ValueError("Invalid source observation")
        needed = {"id", "url", "result", "checked_at", "content_sha256", "error_code"}
        if set(item) != needed:
            raise ValueError("Unexpected source observation schema")
        sid = item["id"]
        if not isinstance(sid, str) or sid not in sources or sid in found:
            raise ValueError("Unknown or repeated source ID")
        if item["url"] != sources[sid] or item["result"] not in RESULTS:
            raise ValueError("Source URL or result mismatched registry")
        if not start <= timestamp(item["checked_at"]) <= finish:
            raise ValueError("Observation timestamp outside cycle")
        if item["result"] == "ok":
            if not isinstance(item["content_sha256"], str) or not SHA.fullmatch(item["content_sha256"]):
                raise ValueError("Successful fetch requires content SHA-256 evidence")
            if item["error_code"] is not None:
                raise ValueError("Successful fetch cannot have an error")
        elif item["content_sha256"] is not None:
            raise ValueError("Failed/skipped source cannot report a content hash")
        elif not isinstance(item["error_code"], str) or not ID.fullmatch(item["error_code"]):
            raise ValueError("Unsuccessful source requires sanitized error code")
        found[sid] = item
    missed = sorted(set(sources) - set(found))
    ok = sum(x["result"] == "ok" for x in found.values())
    record = dict(data)
    record["missing_source_ids"] = missed
    record["source_count_expected"] = len(sources)
    record["source_count_ok"] = ok
    record["cycle_complete"] = ok == len(sources)
    record["verification_scope"] = "collector_report_only_not_independent_source_verification"
    return record


def record_receipt(registry_path, input_path, receipt_dir):
    sources = source_registry(registry_path)
    raw = Path(input_path).read_bytes()
    if len(raw) > MAX_INPUT:
        raise ValueError("Cycle payload too large")
    record = validate_cycle(json.loads(raw), sources)
    folder = Path(receipt_dir)
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    destination = folder / (record["cycle_id"] + ".json")
    blob = (json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd, temp_name = tempfile.mkstemp(prefix=".aiw-", dir=folder)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(blob)
            handle.flush()
            os.fsync(handle.fileno())
        # Atomic create-if-absent: retries cannot rewrite history.
        os.link(temp_name, destination)
        dir_fd = os.open(folder, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        Path(temp_name).unlink(missing_ok=True)
    return {"saved": str(destination), "cycle_id": record["cycle_id"], "complete": record["cycle_complete"]}


def status(registry_path, receipt_dir, now=None, freshness_seconds=600):
    sources = source_registry(registry_path)
    now = now or datetime.now(timezone.utc)
    if freshness_seconds <= 0:
        raise ValueError("Freshness window must be positive")
    folder = Path(receipt_dir)
    records = []
    if folder.exists():
        for p in folder.glob("*.json"):
            if p.stat().st_size > MAX_INPUT:
                raise ValueError("Receipt file unexpectedly large")
            data = json.loads(p.read_text(encoding="utf-8"))
            if p.stem != data.get("cycle_id"):
                raise ValueError("Receipt filename mismatch")
            record = validate_cycle({k: data[k] for k in ("cycle_id", "collector_id", "started_at", "finished_at", "sources")}, sources)
            if data != record:
                raise ValueError("Receipt validation failed")
            records.append(record)
    if not records:
        return {"state": "awaiting_first_cycle", "scheduler_registration_verified": False,
                "sources_expected": len(sources), "sources_ok": 0, "sources_not_checked": sorted(sources),
                "last_cycle_finished_at": None}
    latest = max(records, key=lambda r: (timestamp(r["finished_at"]), r["cycle_id"]))
    age = (now - timestamp(latest["finished_at"])).total_seconds()
    fresh = 0 <= age <= freshness_seconds
    return {"state": ("stale" if not fresh else "healthy" if latest["cycle_complete"] else "degraded"),
            "scheduler_registration_verified": False,
            "last_cycle_id": latest["cycle_id"], "last_cycle_finished_at": latest["finished_at"],
            "age_seconds": round(age), "sources_expected": len(sources),
            "sources_ok": latest["source_count_ok"],
            "sources_not_checked": latest["missing_source_ids"],
            "sources_failed": sorted(x["id"] for x in latest["sources"] if x["result"] != "ok"),
            "evidence_scope": latest["verification_scope"]}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("command", choices=["record", "status"])
    p.add_argument("--registry", required=True)
    p.add_argument("--receipts", required=True)
    p.add_argument("--input", help="Collected cycle JSON, required for record")
    p.add_argument("--freshness-seconds", type=int, default=600)
    a = p.parse_args()
    if a.command == "record":
        if not a.input:
            p.error("record requires --input")
        outcome = record_receipt(a.registry, a.input, a.receipts)
    else:
        outcome = status(a.registry, a.receipts, freshness_seconds=a.freshness_seconds)
    print(json.dumps(outcome, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
