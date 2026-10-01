import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
QUERY = REPO_ROOT / "tools" / "systemia_architecture_query.py"


class ArchitectureQueryTests(unittest.TestCase):
    def run_query(self, topology, query):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "topology.json"
            path.write_text(json.dumps(topology), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(QUERY), "--topology", str(path), "--query", query],
                check=True,
                capture_output=True,
                text=True,
            )
            return json.loads(result.stdout)

    def topology(self):
        return {
            "source_revision": "rev-a",
            "nodes": [
                {
                    "node_key": "file:alpha",
                    "node_type": "file",
                    "display_name": "src/alpha.py",
                    "locator": "file:src/alpha.py",
                    "file_path": "src/alpha.py",
                    "evidence_state": "source_verified",
                    "confidence": "verified",
                    "source_refs": ["source:alpha"],
                },
                {
                    "node_key": "function:run",
                    "node_type": "function",
                    "display_name": "src/alpha.py:run",
                    "locator": "function:src/alpha.py:run",
                    "file_path": "src/alpha.py",
                    "symbol": "run",
                    "evidence_state": "source_verified",
                    "confidence": "verified",
                },
            ],
            "edges": [
                {
                    "edge_key": "edge:owns",
                    "from_node_key": "file:alpha",
                    "to_node_key": "function:run",
                    "relation_type": "owns",
                    "source_location": "src/alpha.py:9",
                    "source_excerpt": "def run():",
                    "discovery_mode": "static",
                    "agreement_state": "declared_only",
                }
            ],
        }

    def test_found_result_contains_exact_source_evidence(self):
        payload = self.run_query(self.topology(), "run")
        self.assertEqual(payload["state"], "found")
        match = payload["matches"][0]
        self.assertEqual(match["symbol"], "run")
        self.assertTrue(match["relationships"])
        self.assertEqual(match["relationships"][0]["source_location"], "src/alpha.py:9")
        self.assertEqual(match["relationships"][0]["source_excerpt"], "def run():")

    def test_not_found_refuses_to_guess(self):
        payload = self.run_query(self.topology(), "totally_missing_symbol")
        self.assertEqual(payload["state"], "not_found")
        self.assertEqual(payload["matches"], [])
        self.assertIn("No behavior claim", payload["message"])

    def test_ambiguous_result_is_marked(self):
        topology = self.topology()
        topology["nodes"].append({
            "node_key": "function:run2",
            "node_type": "function",
            "display_name": "src/beta.py:run",
            "locator": "function:src/beta.py:run",
            "file_path": "src/beta.py",
            "symbol": "run",
            "evidence_state": "source_verified",
            "confidence": "verified",
        })
        payload = self.run_query(topology, "run")
        self.assertEqual(payload["state"], "ambiguous")
        self.assertGreaterEqual(len(payload["matches"]), 2)


if __name__ == "__main__":
    unittest.main()
