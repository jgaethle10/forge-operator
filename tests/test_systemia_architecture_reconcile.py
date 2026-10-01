import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
RECONCILER = REPO_ROOT / "tools" / "systemia_architecture_reconcile.py"


class ArchitectureReconcileTests(unittest.TestCase):
    def run_reconcile(self, static, runtime=None, receipts=None, watch=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            paths = {}
            for name, value in (
                ("static", static),
                ("runtime", runtime),
                ("receipts", receipts),
                ("watch", watch),
            ):
                if value is None:
                    continue
                path = root / f"{name}.json"
                path.write_text(json.dumps(value), encoding="utf-8")
                paths[name] = path

            cmd = [sys.executable, str(RECONCILER), "--static", str(paths["static"])]
            if "runtime" in paths:
                cmd += ["--runtime", str(paths["runtime"])]
            if "receipts" in paths:
                cmd += ["--receipts", str(paths["receipts"])]
            if "watch" in paths:
                cmd += ["--watch", str(paths["watch"])]

            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            return json.loads(result.stdout)

    def static_snapshot(self):
        return {
            "source_revision": "rev-1",
            "edges": [
                {
                    "edge_key": "edge-a-b",
                    "from_node_key": "a",
                    "to_node_key": "b",
                    "relation_type": "routes_to",
                    "source_location": "app.py:12",
                    "source_ref": "source:app.py:12",
                },
                {
                    "edge_key": "edge-b-c",
                    "from_node_key": "b",
                    "to_node_key": "c",
                    "relation_type": "publishes_to",
                    "source_location": "publish.py:8",
                    "source_ref": "source:publish.py:8",
                },
            ],
        }

    def test_preserves_declared_observed_and_receipted_lanes(self):
        runtime = [{
            "from_node_key": "a",
            "to_node_key": "b",
            "relation_type": "routes_to",
            "evidence_ref": "runtime:1",
        }]
        receipts = [{
            "from_node_key": "b",
            "to_node_key": "c",
            "relation_type": "publishes_to",
            "receipt_ref": "receipt:99",
        }]

        payload = self.run_reconcile(self.static_snapshot(), runtime, receipts)

        states = {row["relation_id"]: row["agreement_state"] for row in payload["relationships"]}
        self.assertEqual(states["a|b|routes_to"], "declared_and_observed")
        self.assertEqual(states["b|c|publishes_to"], "receipt_confirmed")
        self.assertFalse(payload["evidence_boundary"]["executes_application_code"])
        self.assertFalse(payload["evidence_boundary"]["queries_production"])

    def test_runtime_only_relation_becomes_finding(self):
        runtime = [{
            "from_node_key": "x",
            "to_node_key": "y",
            "relation_type": "calls",
            "evidence_ref": "runtime:xy",
        }]

        payload = self.run_reconcile(self.static_snapshot(), runtime)

        self.assertTrue(any(
            row["finding_type"] == "observed_not_declared"
            and row["relation_id"] == "x|y|calls"
            for row in payload["findings"]
        ))

    def test_missing_observation_or_receipt_requires_explicit_watch(self):
        no_watch = self.run_reconcile(self.static_snapshot())
        self.assertEqual(no_watch["findings"], [])

        watch = [
            {
                "from_node_key": "a",
                "to_node_key": "b",
                "relation_type": "routes_to",
                "require_observed": True,
                "severity": "medium",
            },
            {
                "from_node_key": "b",
                "to_node_key": "c",
                "relation_type": "publishes_to",
                "require_receipt": True,
                "severity": "high",
            },
        ]

        watched = self.run_reconcile(self.static_snapshot(), watch=watch)
        kinds = {(row["finding_type"], row["relation_id"]) for row in watched["findings"]}
        self.assertIn(("declared_not_observed", "a|b|routes_to"), kinds)
        self.assertIn(("missing_downstream_receipt", "b|c|publishes_to"), kinds)

    def test_receipt_does_not_fake_runtime_observation(self):
        receipts = [{
            "from_node_key": "a",
            "to_node_key": "b",
            "relation_type": "routes_to",
            "receipt_ref": "receipt:ab",
        }]
        payload = self.run_reconcile(self.static_snapshot(), receipts=receipts)
        row = next(r for r in payload["relationships"] if r["relation_id"] == "a|b|routes_to")

        self.assertEqual(row["agreement_state"], "receipt_confirmed")
        self.assertTrue(row["receipted"])
        self.assertFalse(row["observed"])


if __name__ == "__main__":
    unittest.main()
