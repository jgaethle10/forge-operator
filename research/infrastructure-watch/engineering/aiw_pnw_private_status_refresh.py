#!/usr/bin/env python3
"""Publish a fail-closed LOCAL AIW private status after a successful PNW heartbeat.

Only consumes a verified *historical PNW* heartbeat. National collection stays
unverified until an independently validated real collector receipt exists.
Does not reach any external network, modify the source database, or authorize
public release.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile

SCHEMA = "evercraft.aiw.private-operations.v1"


def status_from_heartbeat(heartbeat, *, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        stamp = heartbeat["checked_at_utc"]
        checked = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        age = (now - checked).total_seconds()
        evidence = heartbeat["evidence"]
        good = (
            heartbeat.get("schema") == "evercraft.aiw.heartbeat.v1"
            and heartbeat.get("scope") == "owned_pnw_v015_service_not_national_site"
            and heartbeat.get("status") == "passed"
            and checked.tzinfo is not None
            and 0 <= age <= 120
            and evidence.get("dataset_rows") == 21590
            and evidence.get("snapshot_year") == 2026
            and evidence.get("national_complete") is False
            and evidence.get("live_emergency_check") is False
            and evidence.get("latest_source_refresh_verified") is False
            and heartbeat.get("source_update_performed") is False
        )
    except (ValueError, KeyError, AttributeError, TypeError):
        good = False
        stamp = None

    report = {
        "schema": SCHEMA,
        "generated_at_utc": now.isoformat(),
        "visibility": "private_owner_only",
        "public_release_ready": False,
        "national_collector": {
            "state": "awaiting_first_cycle",
            "last_cycle_finished_at": None,
            "sources_expected": 0,
            "sources_ok": 0,
            "sources_failed_count": 0,
            "sources_not_checked_count": 0,
            "scheduled_300_second_cadence_verified": False,
            "verification_scope": "not_connected",
        },
        "owned_pnw_evidence": {
            "state": "healthy_snapshot" if good else "stale_or_invalid",
            "dataset_year": 2026,
            "coverage": "WA_ID_OR_only",
            "national_coverage": False,
            "last_checked_at_utc": stamp if good else None,
            "source_refresh_verified": False,
            "emergency_feed_connected": False,
        },
        "warnings": [
            "national_collector_not_connected",
            "regional_data_is_historical",
        ] + ([] if good else ["regional_heartbeat_stale_or_invalid"]),
    }
    return report


def atomic_save(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(prefix=".aiw-pnw-status-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        Path(temp).unlink(missing_ok=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--heartbeat", required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    try:
        receipt = json.loads(Path(args.heartbeat).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        receipt = {}
    report = status_from_heartbeat(receipt)
    atomic_save(args.output, report)
    print(json.dumps({
        "saved": True,
        "regional_state": report["owned_pnw_evidence"]["state"],
        "national_state": "awaiting_first_cycle",
        "public_release_ready": False,
    }))
    if report["owned_pnw_evidence"]["state"] != "healthy_snapshot":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
