#!/usr/bin/env python3
"""Static, evidence-claim gate for Evercraft modernization proposals.

No runtime probes, deployment, approval, credential access, or Systemia mission
admission occur here. Passing this gate only requests independent review.
"""
import argparse
import json
import sys
from pathlib import Path

SCHEMA = "evercraft.modernization-change.v1"
RESULT_SCHEMA = "evercraft.modernization-review.v1"
CLASSES = {"general", "commerce", "identity", "customer_data", "control_plane"}
CRITICALITIES = {"standard", "critical"}
BASE_PROOFS = (
    "named_owner_and_runbook",
    "dependency_inventory",
    "backward_compatibility_tests",
    "bounded_rollout_and_rollback_drill",
    "failure_injection",
    "monitoring_and_alerting",
    "operating_cost_and_capacity_budget",
)
CRITICAL_PROOFS = (
    "verified_backup_restore",
    "independent_external_route_check",
    "recovery_time_and_data_loss_objectives",
)
AI_PROOFS = (
    "isolated_ai_dependency",
    "tested_non_ai_or_safe_offline_fallback",
    "ai_timeout_load_and_cost_limit_tests",
    "consequential_action_authority_review",
)
COMMERCE_PROOFS = (
    "payment_idempotency_and_replay_test",
    "provider_receipt_reconciliation",
    "no_duplicate_fulfillment_test",
)
DATA_PROOFS = (
    "data_migration_reconciliation",
    "privacy_and_access_control_review",
)
ALLOWED_STATUSES = {"passed", "failed", "missing", "not_run"}


def required_proofs(change):
    required = list(BASE_PROOFS)
    if change["criticality"] == "critical":
        required.extend(CRITICAL_PROOFS)
    if change["ai_integration"]:
        required.extend(AI_PROOFS)
    if change["service_class"] == "commerce":
        required.extend(COMMERCE_PROOFS)
    if change["service_class"] in {"identity", "customer_data"}:
        required.extend(DATA_PROOFS)
    return required


def review_change(change):
    if not isinstance(change, dict) or change.get("schema") != SCHEMA:
        raise ValueError("modernization_change_schema_required")
    for key in ("change_id", "service"):
        if not isinstance(change.get(key), str) or not change[key].strip():
            raise ValueError(key + "_required")
    if change.get("criticality") not in CRITICALITIES:
        raise ValueError("criticality_invalid")
    if change.get("service_class") not in CLASSES:
        raise ValueError("service_class_invalid")
    if type(change.get("ai_integration")) is not bool:
        raise ValueError("ai_integration_boolean_required")
    evidence = change.get("evidence")
    if not isinstance(evidence, dict):
        raise ValueError("evidence_object_required")

    required = required_proofs(change)
    held, claimed = [], []
    for proof in required:
        row = evidence.get(proof)
        if not isinstance(row, dict):
            held.append({"proof": proof, "reason": "not_supplied"})
            continue
        status = row.get("status")
        if status not in ALLOWED_STATUSES:
            held.append({"proof": proof, "reason": "invalid_or_unknown_status"})
            continue
        ref = row.get("evidence_ref")
        if status != "passed":
            held.append({"proof": proof, "reason": status})
        elif not isinstance(ref, str) or len(ref.strip()) < 8:
            held.append({"proof": proof, "reason": "missing_traceable_evidence_ref"})
        else:
            claimed.append(proof)

    return {
        "schema": RESULT_SCHEMA,
        "change_id": change["change_id"],
        "service": change["service"],
        "state": "held" if held else "ready_for_independent_review",
        "required_proofs": required,
        "evidence_claims_to_verify": claimed,
        "held_proofs": held,
        "source_only": True,
        "runtime_observed": False,
        "evidence_independently_verified": False,
        "systemia_mission_admitted": False,
        "release_authority_granted": False,
        "production_deployment_performed": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="Private or synthetic change manifest JSON")
    parser.add_argument("--out", help="Optional machine-readable result path")
    args = parser.parse_args(argv)
    try:
        change = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        result = review_change(change)
        output = json.dumps(result, sort_keys=True, indent=2) + "\n"
        if args.out:
            Path(args.out).write_text(output, encoding="utf-8")
        print(output, end="")
        return 0 if result["state"] == "ready_for_independent_review" else 1
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({
            "schema": RESULT_SCHEMA,
            "state": "invalid_manifest",
            "error": str(exc),
            "release_authority_granted": False,
        }), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
