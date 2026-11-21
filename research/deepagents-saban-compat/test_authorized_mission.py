#!/usr/bin/env python3
"""Offline authorization-to-runtime bridge tests."""
import copy
import unittest
from authorized_mission import OBJECTIVE, verify_plan

GOOD = {"objective": OBJECTIVE, "workers": [
    {"role": "researcher", "task": "Examine evidence", "capabilities": ["read_public_evidence"]},
    {"role": "analyst", "task": "Compare records", "capabilities": ["analyze_supplied_evidence"]},
    {"role": "auditor", "task": "Review findings", "capabilities": ["review_worker_outputs"]},
]}

class BridgeTests(unittest.TestCase):
    def test_authorized(self):
        result = verify_plan(GOOD)
        self.assertEqual(result["status"], "authorized_plan_only")
        self.assertFalse(result["execution_enabled"])
    def test_missing_auditor_rejected(self):
        p = copy.deepcopy(GOOD)
        p["workers"] = p["workers"][:2]
        with self.assertRaisesRegex(ValueError, "requires analyst and auditor"):
            verify_plan(p)
    def test_unapproved_capability_rejected(self):
        p = copy.deepcopy(GOOD)
        p["workers"][1]["capabilities"] = ["run_shell"]
        with self.assertRaisesRegex(ValueError, "unapproved capability"):
            verify_plan(p)
    def test_objective_change_rejected(self):
        p = copy.deepcopy(GOOD)
        p["objective"] = "Something else"
        with self.assertRaisesRegex(ValueError, "objective mismatch"):
            verify_plan(p)

if __name__ == "__main__":
    unittest.main(verbosity=2)
