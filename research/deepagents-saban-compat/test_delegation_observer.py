import unittest
from types import SimpleNamespace
from delegation_observer import delegation_receipt

def message(*calls):
    return SimpleNamespace(tool_calls=list(calls))

def task(name, call_id):
    return {"name": "task", "args": {"subagent_type": name, "description": "synthetic"}, "id": call_id}

class DelegationObservationTests(unittest.TestCase):
    def test_both_calls_observed(self):
        receipt = delegation_receipt([message(task("claim-extractor", "a"), task("claim-auditor", "b"))])
        self.assertTrue(receipt["all_subagent_task_calls_observed"])
        self.assertFalse(receipt["execution_success_verified"])
        self.assertFalse(receipt["independently_attested"])

    def test_one_agent_is_insufficient(self):
        receipt = delegation_receipt([message(task("claim-extractor", "a"))])
        self.assertFalse(receipt["all_subagent_task_calls_observed"])
        self.assertEqual(receipt["missing_subagents"], ["claim-auditor"])

    def test_non_task_tool_does_not_count(self):
        receipt = delegation_receipt([message({"name": "read_file", "args": {"subagent_type": "claim-auditor"}})])
        self.assertFalse(receipt["all_subagent_task_calls_observed"])

    def test_text_only_is_not_evidence(self):
        receipt = delegation_receipt([SimpleNamespace(content="I delegated to both agents")])
        self.assertFalse(receipt["all_subagent_task_calls_observed"])

    def test_unknown_agent_is_not_evidence(self):
        receipt = delegation_receipt([message(task("unrecognized", "x"))])
        self.assertEqual(receipt["observed_subagents"], [])

if __name__ == "__main__":
    unittest.main()
