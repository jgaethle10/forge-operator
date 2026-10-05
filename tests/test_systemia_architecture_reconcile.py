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
            [{**edge, "runtime_refs": ["runtime:a"], "observation_state": "succeeded"}],
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

    def test_partial_runtime_window_does_not_label_other_declared_edges_dead(self):
        declared = [
            {
                "from_node_key": "router",
                "to_node_key": "worker-a",
                "relation_type": "invokes",
            },
            {
                "from_node_key": "router",
                "to_node_key": "worker-b",
                "relation_type": "invokes",
            },
        ]
        observed = [{
            "from_node_key": "router",
            "to_node_key": "worker-a",
            "relation_type": "invokes",
            "runtime_refs": ["runtime:a"],
        }]

        payload = reconcile_module.reconcile(declared, observed, [])

        self.assertFalse(payload["evidence_boundary"]["runtime_coverage_complete"])
        self.assertFalse(any(
            item["finding_type"] == "declared_not_observed"
            for item in payload["findings"]
        ))

    def test_complete_runtime_window_can_flag_declared_not_observed(self):
        declared = [
            {
                "from_node_key": "router",
                "to_node_key": "worker-a",
                "relation_type": "invokes",
            },
            {
                "from_node_key": "router",
                "to_node_key": "worker-b",
                "relation_type": "invokes",
            },
        ]
        observed = [{
            "from_node_key": "router",
            "to_node_key": "worker-a",
            "relation_type": "invokes",
            "runtime_refs": ["runtime:a"],
        }]

        payload = reconcile_module.reconcile(
            declared,
            observed,
            [],
            runtime_coverage_complete=True,
        )

        missing = [
            item for item in payload["findings"]
            if item["finding_type"] == "declared_not_observed"
        ]
        self.assertEqual(len(missing), 1)

    def test_failed_publish_does_not_create_missing_receipt_finding(self):
        edge = {
            "from_node_key": "publisher",
            "to_node_key": "destination",
            "relation_type": "publishes_to",
        }
        payload = reconcile_module.reconcile(
            [edge],
            [{**edge, "runtime_refs": ["runtime:failed"], "observation_state": "failed"}],
            [],
        )
        self.assertFalse(any(
            item["finding_type"] == "missing_downstream_receipt"
            for item in payload["findings"]
        ))

    def test_locator_observations_resolve_against_static_nodes(self):
        topology = {
            "nodes": [
                {"node_key": "file:collider", "locator": "file:colliderOps/entry.ts"},
                {"node_key": "workflow:worker", "locator": "workflow:workerOps"},
            ],
            "edges": [],
        }
        observations = [{
            "observation_key": "archrt:1",
            "source_locator": "file:colliderOps/entry.ts",
            "target_locator": "workflow:workerOps",
            "relation_type": "invokes",
            "observation_state": "succeeded",
            "evidence_refs": ["cycle:1"],
            "receipt_refs": ["workexec:1"],
        }]

        normalized, unresolved = reconcile_module.normalize_locator_observations(
            topology,
            observations,
        )

        self.assertEqual(unresolved, [])
        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]["from_node_key"], "file:collider")
        self.assertEqual(normalized[0]["to_node_key"], "workflow:worker")
        self.assertEqual(normalized[0]["runtime_refs"], ["archrt:1"])
        self.assertEqual(normalized[0]["observation_state"], "succeeded")

        payload = reconcile_module.reconcile(topology["edges"], normalized, [])
        self.assertEqual(payload["edges"][0]["agreement_state"], "observed_only")
        self.assertFalse(payload["edges"][0]["receipted"])

    def test_unknown_runtime_locator_is_preserved_as_unresolved(self):
        topology = {
            "nodes": [{"node_key": "file:a", "locator": "file:a.ts"}],
            "edges": [],
        }
        normalized, unresolved = reconcile_module.normalize_locator_observations(
            topology,
            [{
                "observation_key": "archrt:missing",
                "source_locator": "file:a.ts",
                "target_locator": "workflow:not-in-snapshot",
                "relation_type": "invokes",
                "observation_state": "succeeded",
            }],
        )
        self.assertEqual(normalized, [])
        self.assertEqual(len(unresolved), 1)
        self.assertTrue(unresolved[0]["missing_target_locator"])

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
