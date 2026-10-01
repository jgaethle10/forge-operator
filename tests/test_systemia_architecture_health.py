import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
HEALTH = REPO_ROOT / "tools" / "systemia_architecture_health.py"


class ArchitectureHealthTests(unittest.TestCase):
    def run_health(self, topology, reconciled=None, watch=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tp = root / "topology.json"
            tp.write_text(json.dumps(topology), encoding="utf-8")
            cmd = [sys.executable, str(HEALTH), "--topology", str(tp)]

            if reconciled is not None:
                rp = root / "reconciled.json"
                rp.write_text(json.dumps(reconciled), encoding="utf-8")
                cmd += ["--reconciled", str(rp)]
            if watch is not None:
                wp = root / "watch.json"
                wp.write_text(json.dumps(watch), encoding="utf-8")
                cmd += ["--node-watch", str(wp)]

            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            return json.loads(result.stdout)

    def test_cycle_is_structurally_detected(self):
        topology = {
            "source_revision": "r1",
            "nodes": [{"node_key": k} for k in ("a", "b", "c")],
            "edges": [
                {"from_node_key": "a", "to_node_key": "b"},
                {"from_node_key": "b", "to_node_key": "c"},
                {"from_node_key": "c", "to_node_key": "a"},
            ],
        }
        payload = self.run_health(topology)
        cycles = [f for f in payload["findings"] if f["finding_type"] == "dependency_cycle"]
        self.assertEqual(len(cycles), 1)
        self.assertEqual(cycles[0]["subject_node_keys"], ["a", "b", "c"])

    def test_orphan_is_not_inferred_without_watch_contract(self):
        topology = {
            "nodes": [{"node_key": "lonely"}],
            "edges": [],
        }
        payload = self.run_health(topology)
        self.assertEqual(payload["findings"], [])

    def test_orphan_and_dead_output_require_explicit_watch(self):
        topology = {
            "nodes": [{"node_key": "lonely"}, {"node_key": "sink"}],
            "edges": [{"from_node_key": "lonely", "to_node_key": "sink"}],
        }
        watch = [
            {"node_key": "lonely", "expect_inbound": True, "severity": "high"},
            {"node_key": "sink", "expect_outbound": True, "severity": "medium"},
        ]
        payload = self.run_health(topology, watch=watch)
        kinds = {(f["finding_type"], tuple(f["subject_node_keys"])) for f in payload["findings"]}
        self.assertIn(("orphan_node", ("lonely",)), kinds)
        self.assertIn(("dead_output", ("sink",)), kinds)

    def test_reconciler_findings_are_preserved(self):
        topology = {
            "nodes": [{"node_key": "a"}, {"node_key": "b"}],
            "edges": [{"from_node_key": "a", "to_node_key": "b"}],
        }
        reconciled = {
            "relationships": [
                {
                    "from_node_key": "a",
                    "to_node_key": "b",
                    "relation_type": "publishes_to",
                }
            ],
            "findings": [
                {
                    "finding_type": "missing_downstream_receipt",
                    "severity": "high",
                    "relation_id": "a|b|publishes_to",
                    "summary": "Missing receipt.",
                    "evidence_refs": ["watch:1"],
                }
            ],
        }
        payload = self.run_health(topology, reconciled=reconciled)
        self.assertTrue(any(
            f["finding_type"] == "missing_downstream_receipt"
            for f in payload["findings"]
        ))
        self.assertFalse(payload["evidence_boundary"]["missing_runtime_implies_dead_code"])


if __name__ == "__main__":
    unittest.main()
