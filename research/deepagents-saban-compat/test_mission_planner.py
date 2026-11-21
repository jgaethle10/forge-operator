#!/usr/bin/env python3
"""Offline policy tests; no model server needed."""
import unittest
from mission_planner import authorize

OBJECTIVE = "Assess a synthetic generator discrepancy"
GOOD = {"objective": OBJECTIVE, "workers": [
    {"role": "analyst", "task": "Compare supplied records", "capabilities": ["analyze_supplied_evidence"]},
    {"role": "auditor", "task": "Review comparison", "capabilities": ["review_worker_outputs"]}
]}

class PlannerPolicyTests(unittest.TestCase):
    def test_authorized(self):
        receipt = authorize(GOOD, OBJECTIVE)
        self.assertEqual(receipt["status"], "authorized_plan_only")
        self.assertFalse(receipt["execution_enabled"])

    def test_forbidden_capability(self):
        import copy
        plan = copy.deepcopy(GOOD)
        plan["workers"][0]["capabilities"] = ["run_shell"]
        with self.assertRaisesRegex(ValueError, "unapproved capability"):
            authorize(plan, OBJECTIVE)

    def test_duplicate_role(self):
        import copy
        plan = copy.deepcopy(GOOD)
        plan["workers"][1]["role"] = "analyst"
        with self.assertRaisesRegex(ValueError, "duplicate role"):
            authorize(plan, OBJECTIVE)

    def test_changed_objective(self):
        import copy
        plan = copy.deepcopy(GOOD)
        plan["objective"] = "Publish a post"
        with self.assertRaisesRegex(ValueError, "objective mismatch"):
            authorize(plan, OBJECTIVE)

    def test_extra_keys(self):
        import copy
        plan = copy.deepcopy(GOOD)
        plan["workers"][0]["command"] = "echo hello"
        with self.assertRaisesRegex(ValueError, "worker structure"):
            authorize(plan, OBJECTIVE)

if __name__ == "__main__":
    unittest.main(verbosity=2)
