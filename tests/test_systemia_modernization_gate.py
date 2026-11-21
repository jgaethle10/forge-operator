import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from systemia_modernization_gate import (
    AI_PROOFS,
    BASE_PROOFS,
    COMMERCE_PROOFS,
    CRITICAL_PROOFS,
    DATA_PROOFS,
    SCHEMA,
    review_change,
)


def specimen(service_class="general", criticality="standard", ai=False):
    return {
        "schema": SCHEMA,
        "change_id": "synthetic-change-001",
        "service": "synthetic-not-a-deployment",
        "criticality": criticality,
        "service_class": service_class,
        "ai_integration": ai,
        "evidence": {},
    }


def claim(change, proof):
    change["evidence"][proof] = {
        "status": "passed",
        "evidence_ref": "synthetic://test-only/" + proof,
    }


class ModernizationGateTests(unittest.TestCase):
    def test_empty_manifest_fail_closed(self):
        result = review_change(specimen())
        self.assertEqual(result["state"], "held")
        self.assertFalse(result["release_authority_granted"])
        self.assertEqual(len(result["held_proofs"]), len(BASE_PROOFS))

    def test_complete_standard_is_only_ready_for_review(self):
        change = specimen()
        for proof in BASE_PROOFS:
            claim(change, proof)
        result = review_change(change)
        self.assertEqual(result["state"], "ready_for_independent_review")
        self.assertFalse(result["runtime_observed"])
        self.assertFalse(result["systemia_mission_admitted"])
        self.assertFalse(result["release_authority_granted"])

    def test_ai_requires_isolation_and_safe_fallback(self):
        change = specimen(ai=True)
        for proof in BASE_PROOFS:
            claim(change, proof)
        result = review_change(change)
        self.assertEqual(result["state"], "held")
        self.assertEqual({r["proof"] for r in result["held_proofs"]}, set(AI_PROOFS))

    def test_critical_requires_real_recovery_evidence_claims(self):
        change = specimen(criticality="critical")
        for proof in BASE_PROOFS:
            claim(change, proof)
        self.assertEqual(
            {r["proof"] for r in review_change(change)["held_proofs"]},
            set(CRITICAL_PROOFS),
        )

    def test_payment_requires_replay_and_receipt_proofs(self):
        change = specimen(service_class="commerce")
        for proof in BASE_PROOFS:
            claim(change, proof)
        self.assertEqual(
            {r["proof"] for r in review_change(change)["held_proofs"]},
            set(COMMERCE_PROOFS),
        )

    def test_customer_data_adds_privacy_and_reconciliation(self):
        change = specimen(service_class="customer_data")
        for proof in BASE_PROOFS:
            claim(change, proof)
        self.assertEqual(
            {r["proof"] for r in review_change(change)["held_proofs"]},
            set(DATA_PROOFS),
        )

    def test_pass_without_evidence_reference_is_held(self):
        change = specimen()
        for proof in BASE_PROOFS:
            claim(change, proof)
        change["evidence"][BASE_PROOFS[0]]["evidence_ref"] = ""
        result = review_change(change)
        self.assertEqual(result["state"], "held")
        self.assertEqual(result["held_proofs"][0]["reason"], "missing_traceable_evidence_ref")

    def test_invalid_and_unknown_states_are_not_green(self):
        change = specimen()
        for proof in BASE_PROOFS:
            claim(change, proof)
        change["evidence"][BASE_PROOFS[0]]["status"] = "unknown"
        self.assertEqual(review_change(change)["state"], "held")

    def test_schema_and_ai_type_validation(self):
        change = specimen()
        change["ai_integration"] = "no"
        with self.assertRaisesRegex(ValueError, "ai_integration_boolean_required"):
            review_change(change)
        change["ai_integration"] = False
        change["schema"] = "old-schema"
        with self.assertRaisesRegex(ValueError, "modernization_change_schema_required"):
            review_change(change)


if __name__ == "__main__":
    unittest.main()
