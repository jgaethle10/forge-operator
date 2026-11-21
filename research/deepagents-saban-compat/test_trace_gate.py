import unittest
from trace_gate import evaluate_trace

class TraceGateTests(unittest.TestCase):
    def test_both_agents_required(self):
        events = [
            {"agent": "claim-extractor", "event": "started"},
            {"agent": "claim-extractor", "event": "completed"},
            {"agent": "claim-auditor", "event": "started"},
            {"agent": "claim-auditor", "event": "completed"},
        ]
        receipt = evaluate_trace(events)
        self.assertTrue(receipt["verified_from_supplied_events"])
        self.assertFalse(receipt["independently_attested"])
        self.assertEqual(len(receipt["trace_sha256"]), 64)

    def test_missing_auditor_fails(self):
        receipt = evaluate_trace([
            {"agent": "claim-extractor", "event": "started"},
            {"agent": "claim-extractor", "event": "completed"},
        ])
        self.assertFalse(receipt["verified_from_supplied_events"])
        self.assertIn("claim-auditor", receipt["missing_agents"])

    def test_completion_without_start_fails(self):
        receipt = evaluate_trace([
            {"agent": "claim-extractor", "event": "completed"},
            {"agent": "claim-auditor", "event": "started"},
            {"agent": "claim-auditor", "event": "completed"},
        ])
        self.assertFalse(receipt["verified_from_supplied_events"])
        self.assertTrue(receipt["errors"])

    def test_unknown_agent_fails(self):
        self.assertFalse(evaluate_trace([{"agent": "unknown", "event": "completed"}])["verified_from_supplied_events"])

    def test_duplicate_completion_fails(self):
        events = [
            {"agent": "claim-extractor", "event": "started"},
            {"agent": "claim-extractor", "event": "completed"},
            {"agent": "claim-extractor", "event": "completed"},
            {"agent": "claim-auditor", "event": "started"},
            {"agent": "claim-auditor", "event": "completed"},
        ]
        self.assertFalse(evaluate_trace(events)["verified_from_supplied_events"])

if __name__ == "__main__":
    unittest.main()
