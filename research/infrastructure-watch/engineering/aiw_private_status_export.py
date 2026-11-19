#!/usr/bin/env python3
"""Generate a PRIVATE AIW operations snapshot from real local receipt files.

No network, no scheduler registration, no public release, no claimed live safety.
The output is operational metadata for an authenticated owner-facing page only.
Never expose private receipt paths, detailed source URLs or credentials.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import tempfile


def load_receipt_module():
    path = Path(__file__).with_name("aiw_kaidance_receipts.py")
    spec = importlib.util.spec_from_file_location("aiw_kaidance_receipts", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def collect_status(registry, receipts, heartbeat_path, now=None):
    now = now or datetime.now(timezone.utc)
    source = load_receipt_module().status(registry, receipts, now=now)
    # Collector-reported freshness is not the same as independently verified data.
    source_state = source["state"]
    result = {
        "schema": "evercraft.aiw.private-operations.v1",
        "generated_at_utc": now.isoformat(),
        "visibility": "private_owner_only",
        "public_release_ready": False,
        "national_collector": {
            "state": source_state,
            "last_cycle_finished_at": source.get("last_cycle_finished_at"),
            "sources_expected": source["sources_expected"],
            "sources_ok": source["sources_ok"],
            "sources_failed_count": len(source.get("sources_failed", [])),
            "sources_not_checked_count": len(source.get("sources_not_checked", [])),
            "scheduled_300_second_cadence_verified": False,
            "verification_scope": "collector_report_only",
        },
        "owned_pnw_evidence": {
            "state": "unverified",
            "dataset_year": 2026,
            "coverage": "WA_ID_OR_only",
            "national_coverage": False,
            "last_checked_at_utc": None,
            "source_refresh_verified": False,
            "emergency_feed_connected": False,
        },
        "warnings": [],
    }
    if source_state != "healthy":
        result["warnings"].append("national_collector_" + source_state)
    try:
        hb = json.loads(Path(heartbeat_path).read_text(encoding="utf-8"))
        checked = datetime.fromisoformat(hb["checked_at_utc"].replace("Z", "+00:00"))
        age = (now - checked).total_seconds()
        verified = (
            hb.get("schema") == "evercraft.aiw.heartbeat.v1"
            and hb.get("scope") == "owned_pnw_v015_service_not_national_site"
            and hb.get("status") == "passed"
            and hb.get("evidence", {}).get("dataset_rows") == 21590
            and hb.get("evidence", {}).get("national_complete") is False
            and hb.get("evidence", {}).get("live_emergency_check") is False
            and hb.get("evidence", {}).get("latest_source_refresh_verified") is False
            and checked.tzinfo is not None and 0 <= age <= 600
        )
        if verified:
            result["owned_pnw_evidence"]["state"] = "healthy_snapshot"
            result["owned_pnw_evidence"]["last_checked_at_utc"] = hb["checked_at_utc"]
        else:
            result["owned_pnw_evidence"]["state"] = "stale_or_invalid"
            result["warnings"].append("owned_pnw_heartbeat_stale_or_invalid")
    except (FileNotFoundError, ValueError, TypeError, KeyError, AttributeError, json.JSONDecodeError):
        result["warnings"].append("owned_pnw_heartbeat_missing_or_unreadable")
    # Release approval is checked separately; a healthy private status never implies GO.
    return result


def save_atomic(path, obj):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".aiw-private-status-", dir=target.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)
    finally:
        Path(tmp).unlink(missing_ok=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--registry", required=True)
    p.add_argument("--receipts", required=True)
    p.add_argument("--heartbeat", required=True)
    p.add_argument("--output", required=True)
    a = p.parse_args()
    try:
        outcome = collect_status(a.registry, a.receipts, a.heartbeat)
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as exc:
        # If the collector receipts themselves cannot be validated, do not publish
        # an apparently healthy status JSON over a prior status.
        raise SystemExit("FAIL CLOSED: source registry/receipts invalid: " + str(exc)[:180])
    save_atomic(a.output, outcome)
    print(json.dumps({"saved": True, "collector_state": outcome["national_collector"]["state"],
                      "pnw_state": outcome["owned_pnw_evidence"]["state"],
                      "public_release_ready": False}))


if __name__ == "__main__":
    main()
