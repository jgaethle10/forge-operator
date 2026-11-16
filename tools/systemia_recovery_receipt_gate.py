#!/usr/bin/env python3
"""Read-only structural reconciliation of a bounded Evercraft recovery drill.

This never probes a network or verifies the authenticity of supplied receipts.
A consistent report is only a candidate for separate trusted review.
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

SCHEMA = "evercraft.recovery-drill-evidence.v1"
RESULT_SCHEMA = "evercraft.recovery-drill-review.v1"
PHASES = ("baseline", "fault", "recovered", "external")
DIGEST_PREFIX = "sha256:"


def parsed_time(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.utcoffset() is None:
            return None
        return parsed
    except ValueError:
        return None


def review_recovery(drill):
    if not isinstance(drill, dict) or drill.get("schema") != SCHEMA:
        raise ValueError("recovery_drill_schema_required")
    for field in ("run_id", "service_id"):
        if not isinstance(drill.get(field), str) or not drill[field].strip():
            raise ValueError(field + "_required")
    if drill.get("mode") not in ("isolated_simulation", "field_observation"):
        raise ValueError("mode_invalid")

    failures = []
    def fail(reason):
        if reason not in failures:
            failures.append(reason)

    events = drill.get("events")
    if not isinstance(events, dict):
        events = {}
        fail("events_missing")

    times = {}
    for phase in PHASES:
        item = events.get(phase)
        if not isinstance(item, dict):
            fail(phase + "_missing")
            continue
        if item.get("run_id") != drill["run_id"] or item.get("service_id") != drill["service_id"]:
            fail(phase + "_identity_mismatch")
        times[phase] = parsed_time(item.get("observed_at"))
        if times[phase] is None:
            fail(phase + "_timestamp_invalid")
        if not isinstance(item.get("observer_id"), str) or not item["observer_id"].strip():
            fail(phase + "_observer_missing")

    baseline = events.get("baseline", {}) if isinstance(events.get("baseline"), dict) else {}
    fault = events.get("fault", {}) if isinstance(events.get("fault"), dict) else {}
    recovered = events.get("recovered", {}) if isinstance(events.get("recovered"), dict) else {}
    external = events.get("external", {}) if isinstance(events.get("external"), dict) else {}
    if baseline.get("state") != "healthy":
        fail("baseline_not_healthy")
    if fault.get("state") != "unavailable":
        fail("fault_not_observed")
    if recovered.get("state") != "healthy":
        fail("recovery_not_healthy")

    if len(times) == 4 and all(times.values()):
        if not (times["baseline"] <= times["fault"] < times["recovered"] <= times["external"]):
            fail("event_order_invalid")

    expected_digest = baseline.get("checkpoint_digest")
    if not isinstance(expected_digest, str) or len(expected_digest) != 71 or not expected_digest.startswith(DIGEST_PREFIX) or any(c not in "0123456789abcdef" for c in expected_digest[7:]):
        fail("checkpoint_digest_invalid")
    elif recovered.get("checkpoint_digest") != expected_digest:
        fail("checkpoint_not_restored")

    # An observed state snapshot cannot establish a genuine backup restoration.
    # The field reviewer must inspect backup, target, restoration and source receipts.
    if recovered.get("restored_from_backup") is not True:
        fail("backup_restore_claim_missing")

    target = drill.get("objectives")
    if not isinstance(target, dict):
        target = {}
    rto = target.get("rto_seconds")
    rpo = target.get("rpo_seconds")
    if type(rto) is not int or not 1 <= rto <= 86400:
        fail("rto_target_invalid")
    if type(rpo) is not int or not 0 <= rpo <= 86400:
        fail("rpo_target_invalid")

    measured_rto = None
    if times.get("fault") and times.get("recovered"):
        measured_rto = (times["recovered"] - times["fault"]).total_seconds()
        if measured_rto < 0 or (type(rto) is int and measured_rto > rto):
            fail("rto_exceeded")

    # Last committed source timestamp is compared against the restored checkpoint,
    # not against the wall-clock recovery time (which would inflate data loss).
    measured_rpo = None
    baseline_commit = parsed_time(baseline.get("last_commit_at"))
    restored_commit = parsed_time(recovered.get("last_commit_at"))
    if not baseline_commit or not restored_commit:
        fail("commit_timestamps_missing")
    elif times.get("baseline") and baseline_commit > times["baseline"]:
        fail("baseline_commit_after_observation")
    elif times.get("recovered") and restored_commit > times["recovered"]:
        fail("restored_commit_after_observation")
    else:
        measured_rpo = max(0, (baseline_commit - restored_commit).total_seconds())
        if type(rpo) is int and measured_rpo > rpo:
            fail("rpo_exceeded")

    actions = drill.get("irreversible_actions")
    if not isinstance(actions, dict):
        actions = {}
    for key in ("before", "after", "duplicate_executions", "expired_replays_accepted"):
        if type(actions.get(key)) is not int or actions[key] < 0:
            fail("irreversible_action_counts_invalid")
    if all(type(actions.get(key)) is int and actions[key] >= 0 for key in ("before", "after", "duplicate_executions", "expired_replays_accepted")):
        if actions["after"] != actions["before"] or actions["duplicate_executions"] != 0 or actions["expired_replays_accepted"] != 0:
            fail("irreversible_action_replay_risk")

    if external.get("result") != "pass" or external.get("trusted_tls") is not True:
        fail("external_probe_not_passed")
    endpoint = external.get("url")
    try:
        endpoint_parts = urlsplit(endpoint) if isinstance(endpoint, str) else None
        if endpoint_parts is None or endpoint_parts.scheme != "https" or not endpoint_parts.hostname or endpoint_parts.username or endpoint_parts.password:
            fail("external_https_endpoint_invalid")
    except ValueError:
        fail("external_https_endpoint_invalid")
    if external.get("observer_id") in (baseline.get("observer_id"), recovered.get("observer_id")):
        fail("independent_observer_not_distinct")
    if not isinstance(external.get("deployment_digest"), str) or external.get("deployment_digest") != recovered.get("deployment_digest") or not external.get("deployment_digest"):
        fail("deployment_identity_unmatched")

    if drill["mode"] == "field_observation":
        primary = baseline.get("host_id")
        secondary = recovered.get("host_id")
        if not isinstance(primary, str) or not isinstance(secondary, str) or not primary or not secondary or primary == secondary:
            fail("distinct_host_not_claimed")
        if not baseline.get("power_domain") or not recovered.get("power_domain") or baseline.get("power_domain") == recovered.get("power_domain"):
            fail("independent_power_domain_not_claimed")

    consistent = not failures
    state = "held"
    if consistent:
        state = ("simulation_consistent_for_review" if drill["mode"] == "isolated_simulation"
                 else "field_evidence_candidate_for_review")

    return {
        "schema": RESULT_SCHEMA,
        "run_id": drill["run_id"],
        "service_id": drill["service_id"],
        "mode_claimed": drill["mode"],
        "state": state,
        "structural_failures": failures,
        "observed_rto_seconds_claimed": measured_rto,
        "observed_rpo_seconds_claimed": measured_rpo,
        "evidence_authenticity_verified": False,
        "independent_observer_identity_verified": False,
        "physical_field_certification_granted": False,
        "systemia_admission_confirmed": False,
        "release_authority_granted": False,
        "network_probe_performed": False,
        "live_backup_restore_performed": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", help="Optional redacted summary JSON destination")
    args = parser.parse_args(argv)
    try:
        drill = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        review = review_recovery(drill)
        output = json.dumps(review, indent=2, sort_keys=True) + "\n"
        if args.out:
            Path(args.out).write_text(output, encoding="utf-8")
        print(output, end="")
        return 1 if review["state"] == "held" else 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"schema": RESULT_SCHEMA, "state": "invalid_manifest",
                          "reason": str(exc), "release_authority_granted": False}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
