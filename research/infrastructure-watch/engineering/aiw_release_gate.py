#!/usr/bin/env python3
"""AIW publication gate: refuse launch without independent owned-node evidence.

Offline evaluator only; does not modify DNS, deployments, schedules or sources.
Never equate a passing PNW snapshot with the hosted national website.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

MAX_AGE_SECONDS = 600
REQUIRED = ("pnw_heartbeat", "national_collector", "owned_host", "private_site")


def load(path):
    obj = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(obj, dict):
        raise ValueError("Evidence must be a JSON object")
    return obj


def recent(timestamp, now):
    if not isinstance(timestamp, str):
        return False
    try:
        when = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return when.tzinfo is not None and 0 <= (now - when).total_seconds() <= MAX_AGE_SECONDS
    except ValueError:
        return False


def evaluate(manifest, now):
    failures = []
    if manifest.get("schema") != "evercraft.aiw.release-evidence.v1":
        failures.append("invalid_manifest_schema")
    gates = manifest.get("gates")
    if not isinstance(gates, dict):
        gates = {}
    for key in REQUIRED:
        info = gates.get(key)
        if not isinstance(info, dict):
            failures.append(key + ":missing")
            continue
        if info.get("status") != "verified":
            failures.append(key + ":unverified")
        if not recent(info.get("checked_at_utc"), now):
            failures.append(key + ":missing_or_stale_timestamp")
        if not isinstance(info.get("receipt_ref"), str) or not info["receipt_ref"].strip():
            failures.append(key + ":missing_receipt_reference")
    # Distinct gates: a single heartbeat cannot prove hosted national data freshness.
    national = gates.get("national_collector", {})
    if isinstance(national, dict):
        if national.get("all_nine_sources_checked") is not True:
            failures.append("national_collector:not_all_sources_checked")
        if national.get("three_scheduled_cycles_verified") is not True:
            failures.append("national_collector:scheduled_cycles_unverified")
        if national.get("yakima_minutes_status") != "ok":
            failures.append("national_collector:yakima_minutes_not_verified")
    owned = gates.get("owned_host", {})
    if isinstance(owned, dict):
        if owned.get("kaidance_300s_schedule_verified") is not True:
            failures.append("owned_host:kaidance_cadence_unverified")
        if owned.get("rollback_test_verified") is not True:
            failures.append("owned_host:rollback_unverified")
    site = gates.get("private_site", {})
    if isinstance(site, dict):
        if site.get("private_access_verified") is not True:
            failures.append("private_site:access_unverified")
        if site.get("national_ui_evidence_binding_verified") is not True:
            failures.append("private_site:evidence_binding_unverified")
        if site.get("mobile_review_verified") is not True:
            failures.append("private_site:mobile_review_unverified")
    if manifest.get("founder_publication_approval") is not True:
        failures.append("founder_publication_approval:missing")
    return {"decision": "GO" if not failures else "NO_GO",
            "checked_at_utc": now.isoformat(), "failures": sorted(set(failures)),
            "note": "This is a receipt-presence contract; operators must authenticate referenced evidence independently."}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", required=True)
    args = ap.parse_args()
    now = datetime.now(timezone.utc)
    try:
        decision = evaluate(load(args.manifest), now)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        decision = {"decision": "NO_GO", "checked_at_utc": now.isoformat(),
                    "failures": ["unreadable_or_invalid_manifest: " + str(exc)[:150]]}
    print(json.dumps(decision, indent=2, sort_keys=True))
    return 0 if decision["decision"] == "GO" else 1


if __name__ == "__main__":
    sys.exit(main())
