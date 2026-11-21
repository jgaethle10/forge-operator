import copy
import unittest
from authorized_mission import OBJECTIVE
from capability_dispatch import dispatch_roles

PLAN = {"objective": OBJECTIVE, "workers": [
    {"role": "analyst", "task": "Extract synthetic generator measurements",
     "capabilities": ["analyze_supplied_evidence"]},
    {"role": "auditor", "task": "Check discrepancy",
     "capabilities": ["review_worker_outputs"]},
]}

class CapabilityDispatchTests(unittest.TestCase):
    def test_allowed_analyst_auditor(self):
        self.assertEqual(len(dispatch_roles(PLAN)["workers"]), 2)
    def test_researcher_not_executable(self):
        p = copy.deepcopy(PLAN)
        p["workers"].insert(0, {"role": "researcher", "task": "Collect evidence",
                                "capabilities": ["read_public_evidence"]})
        with self.assertRaisesRegex(ValueError, "no executable implementation"):
            dispatch_roles(p)
    def test_wrong_order_rejected(self):
        p = copy.deepcopy(PLAN)
        p["workers"].reverse()
        with self.assertRaisesRegex(ValueError, "ordered analyst then auditor"):
            dispatch_roles(p)
    def test_empty_capability_rejected(self):
        p = copy.deepcopy(PLAN)
        p["workers"][0]["capabilities"] = []
        with self.assertRaisesRegex(ValueError, "exact executable capability"):
            dispatch_roles(p)
    def test_forbidden_capability_rejected(self):
        p = copy.deepcopy(PLAN)
        p["workers"][0]["capabilities"] = ["run_shell"]
        with self.assertRaisesRegex(ValueError, "unapproved capability"):
            dispatch_roles(p)

if __name__ == "__main__":
    unittest.main(verbosity=2)
