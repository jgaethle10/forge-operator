import importlib.util
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = REPO_ROOT / "tools" / "systemia_architecture_reconcile.py"

spec = importlib.util.spec_from_file_location("systemia_architecture_reconcile", MODULE_PATH)
reconcile_module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(reconcile_module)


class ArchitectureReconcileTests(unittest.TestCase):
    def test_evidence_channels_remain_distinct(self):
        declared = [{
            "from_node_key": "publisher",
            "to_node_key": "destination",
            "relation_type": "publishes_to",
            "source_refs": ["source:file:10"],
        }]
        observed = [{
            "from_node_key": "publisher",
            "to_node_key": "destination",
            "relation_type": "publishes_to",
            "runtime_refs": ["runtime:call:1"],
        }]

        payload = reconcile_module.reconcile(declared, observed, [])

        self.assertFalse(payload["evidence_boundary"]["declared_is_runtime_proof"])
        self.assertFalse(payload["evidence_boundary"]["runtime_is_receipt_proof"])
        self.assertEqual(payload["edges"][0]["agreement_state"], "declared_and_observed")
        self.assertEqual(payload["findings"][0]["finding_type"], "missing_downstream_receipt")

    def test_receipt_confirms_without_erasing_channel_history(self):
        edge = {
            "from_node_key": "router",
            "to_node_key": "worker",
            "relation_type": "routes_to",
        }
        payload = reconcile_module.reconcile(
            [{**edge, "source_refs": ["source:a"]}],
            [{**edge, "runtime_refs": ["runtime:a"]}],
            [{**edge, "receipt_refs": ["receipt:a"]}],
        )

        row = payload["edges"][0]
        self.assertEqual(row["agreement_state"], "receipt_confirmed")
        self.assertTrue(row["declared"])
        self.assertTrue(row["observed"])
        self.assertTrue(row["receipted"])
        self.assertEqual(payload["findings"], [])

    def test_runtime_only_coupling_is_high_severity(self):
        observed = [{
            "from_node_key": "a",
            "to_node_key": "b",
            "relation_type": "invokes",
            "runtime_refs": ["runtime:unexpected"],
        }]
        payload = reconcile_module.reconcile([], observed, [])

        finding = next(
            item for item in payload["findings"]
            if item["finding_type"] == "observed_not_declared"
        )
        self.assertEqual(finding["severity"], "high")
        self.assertEqual(payload["edges"][0]["agreement_state"], "observed_only")

    def test_imports_do_not_trigger_runtime_findings_by_default(self):
        declared = [{
            "from_node_key": "file:a",
            "to_node_key": "module:b",
            "relation_type": "imports",
        }]
        payload = reconcile_module.reconcile(declared, [], [])
        self.assertEqual(payload["findings"], [])


if __name__ == "__main__":
    unittest.main()
