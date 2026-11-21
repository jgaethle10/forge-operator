import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from systemia_recovery_receipt_gate import SCHEMA, review_recovery


def case(mode="isolated_simulation"):
    digest = "sha256:" + "a" * 64
    return {
        "schema": SCHEMA, "run_id": "synthetic-drill-001",
        "service_id": "synthetic-worlds-vault",
        "mode": mode,
        "objectives": {"rto_seconds": 120, "rpo_seconds": 0},
        "irreversible_actions": {
            "before": 2, "after": 2,
            "duplicate_executions": 0, "expired_replays_accepted": 0
        },
        "events": {
            "baseline": {
                "service_id": "synthetic-worlds-vault",
                "run_id": "synthetic-drill-001",
                "observer_id": "primary-observer",
                "observed_at": "2026-11-15T12:00:00Z",
                "last_commit_at": "2026-11-15T11:59:55Z",
                "state": "healthy", "checkpoint_digest": digest,
                "host_id": "synthetic-host-A", "power_domain": "synthetic-power-A"
            },
            "fault": {
                "service_id": "synthetic-worlds-vault",
                "run_id": "synthetic-drill-001",
                "observer_id": "fault-observer",
                "observed_at": "2026-11-15T12:01:00Z",
                "state": "unavailable"
            },
            "recovered": {
                "service_id": "synthetic-worlds-vault",
                "run_id": "synthetic-drill-001",
                "observer_id": "secondary-observer",
                "observed_at": "2026-11-15T12:01:40Z",
                "last_commit_at": "2026-11-15T11:59:55Z",
                "state": "healthy", "checkpoint_digest": digest,
                "restored_from_backup": True,
                "deployment_digest": "sha256:" + "b" * 64,
                "host_id": "synthetic-host-B", "power_domain": "synthetic-power-B"
            },
            "external": {
                "service_id": "synthetic-worlds-vault",
                "run_id": "synthetic-drill-001",
                "observer_id": "separate-external-probe",
                "observed_at": "2026-11-15T12:01:41Z",
                "url": "https://example.invalid/health",
                "result": "pass", "trusted_tls": True,
                "deployment_digest": "sha256:" + "b" * 64
            }
        }
    }


class RecoveryReceiptGateTests(unittest.TestCase):
    def test_consistent_simulation_does_not_certify_field(self):
        result = review_recovery(case())
        self.assertEqual(result["state"], "simulation_consistent_for_review")
        self.assertEqual(result["observed_rto_seconds_claimed"], 40.0)
        self.assertFalse(result["evidence_authenticity_verified"])
        self.assertFalse(result["physical_field_certification_granted"])
        self.assertFalse(result["live_backup_restore_performed"])

    def test_distinct_physical_domain_is_only_a_candidate_claim(self):
        result = review_recovery(case("field_observation"))
        self.assertEqual(result["state"], "field_evidence_candidate_for_review")
        self.assertFalse(result["independent_observer_identity_verified"])

    def test_reject_corrupted_checkpoint_claim(self):
        drill = case()
        drill["events"]["recovered"]["checkpoint_digest"] = "sha256:" + "c" * 64
        self.assertIn("checkpoint_not_restored", review_recovery(drill)["structural_failures"])

    def test_reject_missed_rto(self):
        drill = case()
        drill["events"]["recovered"]["observed_at"] = "2026-11-15T12:09:00Z"
        drill["events"]["external"]["observed_at"] = "2026-11-15T12:09:01Z"
        self.assertIn("rto_exceeded", review_recovery(drill)["structural_failures"])

    def test_reject_rpo_data_loss(self):
        drill = case()
        drill["events"]["recovered"]["last_commit_at"] = "2026-11-15T11:59:50Z"
        self.assertIn("rpo_exceeded", review_recovery(drill)["structural_failures"])

    def test_reject_duplicate_irreversible_action(self):
        drill = case()
        drill["irreversible_actions"]["after"] = 3
        self.assertEqual(review_recovery(drill)["state"], "held")
        self.assertIn("irreversible_action_replay_risk", review_recovery(drill)["structural_failures"])

    def test_reject_external_probe_with_same_observer(self):
        drill = case()
        drill["events"]["external"]["observer_id"] = "secondary-observer"
        self.assertIn("independent_observer_not_distinct", review_recovery(drill)["structural_failures"])

    def test_reject_http_and_deployment_drift(self):
        drill = case()
        drill["events"]["external"]["url"] = "http://example.invalid/health"
        drill["events"]["external"]["deployment_digest"] = "sha256:" + "f" * 64
        result = review_recovery(drill)
        self.assertIn("external_https_endpoint_invalid", result["structural_failures"])
        self.assertIn("deployment_identity_unmatched", result["structural_failures"])

    def test_reject_same_host_and_power_domain_claim(self):
        drill = case("field_observation")
        drill["events"]["recovered"]["host_id"] = "synthetic-host-A"
        drill["events"]["recovered"]["power_domain"] = "synthetic-power-A"
        result = review_recovery(drill)
        self.assertIn("distinct_host_not_claimed", result["structural_failures"])
        self.assertIn("independent_power_domain_not_claimed", result["structural_failures"])

    def test_reject_not_observed_fault(self):
        drill = case()
        drill["events"]["fault"]["state"] = "healthy"
        self.assertIn("fault_not_observed", review_recovery(drill)["structural_failures"])

    def test_reject_missing_recovery_data(self):
        drill = case()
        drill["events"].pop("recovered")
        result = review_recovery(drill)
        self.assertIn("recovered_missing", result["structural_failures"])

    def test_reject_naive_timestamp(self):
        drill = case()
        drill["events"]["fault"]["observed_at"] = "2026-11-15T12:01:00"
        self.assertIn("fault_timestamp_invalid", review_recovery(drill)["structural_failures"])

    def test_reject_stale_external_observation(self):
        drill = case()
        drill["events"]["external"]["observed_at"] = "2026-11-15T12:00:20Z"
        self.assertIn("event_order_invalid", review_recovery(drill)["structural_failures"])

    def test_reject_missing_backup_restoration(self):
        drill = case()
        drill["events"]["recovered"]["restored_from_backup"] = False
        self.assertIn("backup_restore_claim_missing", review_recovery(drill)["structural_failures"])

    def test_invalid_schema_not_reviewed(self):
        drill = case()
        drill["schema"] = "other-schema"
        with self.assertRaisesRegex(ValueError, "recovery_drill_schema_required"):
            review_recovery(drill)


if __name__ == "__main__":
    unittest.main()
