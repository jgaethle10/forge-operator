import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
SCANNER = REPO_ROOT / "tools" / "systemia_architecture_scan.py"


class ArchitectureScannerTests(unittest.TestCase):
    def run_scan(self, root: Path) -> dict:
        result = subprocess.run(
            [sys.executable, str(SCANNER), "--root", str(root)],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            self.fail(
                f"scanner failed with exit code {result.returncode}\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}"
            )
        return json.loads(result.stdout)

    def test_static_scan_is_source_grounded_and_read_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "alpha.py").write_text(
                "import os\nfrom json import loads\n\n"
                "class Worker:\n    pass\n\n"
                "def run():\n    return 1\n",
                encoding="utf-8",
            )
            (root / "beta.ts").write_text(
                "import thing from './thing'\n"
                "const lazy = import('./lazy')\n",
                encoding="utf-8",
            )

            payload = self.run_scan(root)

            self.assertEqual(payload["scanner_version"], "systemia-architecture-scan/1.4")
            self.assertEqual(payload["scan_mode"], "static_only")
            self.assertFalse(payload["evidence_boundary"]["executes_scanned_code"])
            self.assertFalse(payload["evidence_boundary"]["claims_runtime_behavior"])
            self.assertEqual(payload["counts"]["files"], 2)

            edges = payload["edges"]
            self.assertTrue(any(e["relation_type"] == "imports" for e in edges))
            self.assertTrue(any(e["relation_type"] == "owns" for e in edges))
            self.assertTrue(all(e["source_location"] for e in edges))
            self.assertTrue(all(e["source_excerpt"] for e in edges))
            self.assertTrue(all(e["agreement_state"] == "declared_only" for e in edges))

            ts_coverage = next(
                row for row in payload["coverage"] if row["file_path"] == "beta.ts"
            )
            self.assertEqual(ts_coverage["state"], "partial")


    def test_base44_entity_and_function_edges_are_extracted_without_execution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "entry.ts").write_text(
                "const a = await sr.entities.ColliderWorkItem.filter({stage: 'qa'})\n"
                "await sr.entities.ExecutionCheckpoint\n"
                "  .create({checkpoint_key: 'x'})\n"
                "await base44.functions\n"
                "  .invoke('workerOps', {action: 'run'})\n",
                encoding="utf-8",
            )

            payload = self.run_scan(root)

            relations = {(e["relation_type"], e["source_excerpt"]) for e in payload["edges"]}
            self.assertTrue(any(r == "reads" and "ColliderWorkItem.filter" in x for r, x in relations))
            self.assertTrue(any(r == "writes" and "ExecutionCheckpoint.create" in x for r, x in relations))
            self.assertTrue(any(r == "invokes" and "functions.invoke('workerOps'" in x for r, x in relations))

            node_types = {(n["node_type"], n["display_name"]) for n in payload["nodes"]}
            self.assertIn(("entity", "ColliderWorkItem"), node_types)
            self.assertIn(("entity", "ExecutionCheckpoint"), node_types)
            self.assertIn(("workflow", "workerOps"), node_types)

            self.assertFalse(payload["evidence_boundary"]["executes_scanned_code"])
            self.assertFalse(payload["evidence_boundary"]["claims_runtime_behavior"])

    def test_base44_https_function_endpoint_is_extracted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "socialWakeBridge.ts").write_text(
                "const APP = 'abc'\\n"
                "const URL = `https://base44.app/api/apps/${APP}/functions/systemiaEPSPublishIngress`\\n"
                "const response = await fetch(URL, {method: 'POST'})\\n",
                encoding="utf-8",
            )

            payload = self.run_scan(root)

            self.assertTrue(any(
                edge["relation_type"] == "invokes"
                and edge["source_excerpt"].endswith("/functions/systemiaEPSPublishIngress")
                for edge in payload["edges"]
            ))
            self.assertIn(
                ("workflow", "systemiaEPSPublishIngress"),
                {(n["node_type"], n["display_name"]) for n in payload["nodes"]},
            )
    def test_verified_literal_entity_helpers_add_only_source_grounded_edges(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "helpers.ts").write_text(
                "async function createIfMissing(sr: any, entity: string, keyField: string, key: string, payload: any) {\n"
                "  const prior = await sr.entities[entity].filter({ [keyField]: key }, '-created_date', 1)\n"
                "  if (prior?.length) return prior[0]\n"
                "  return await sr.entities[entity].create(payload)\n"
                "}\n"
                "async function one(sr: any, entity: string, query: any) {\n"
                "  const rows = await sr.entities[entity].filter(query, '-created_date', 1)\n"
                "  return rows?.[0] || null\n"
                "}\n"
                "await createIfMissing(sr, 'ColliderArtifact', 'artifact_key', key, payload)\n"
                "const mission = await one(sr, 'MissionLedger', {mission_key: 'm'})\n",
                encoding="utf-8",
            )
            (root / "unverified.ts").write_text(
                "async function createIfMissing(sr: any, entity: string) { return null }\n"
                "await createIfMissing(sr, 'ShouldNotAppear')\n",
                encoding="utf-8",
            )

            payload = self.run_scan(root)
            helper_edges = [
                e for e in payload["edges"]
                if e.get("parser_mode") == "base44_verified_literal_helper_access"
            ]
            triples = {
                (
                    e["relation_type"],
                    next(
                        n["display_name"]
                        for n in payload["nodes"]
                        if n["node_key"] == e["to_node_key"]
                    ),
                    e["source_location"],
                )
                for e in helper_edges
            }

            self.assertTrue(any(r == "reads" and target == "ColliderArtifact" for r, target, _ in triples))
            self.assertTrue(any(r == "writes" and target == "ColliderArtifact" for r, target, _ in triples))
            self.assertTrue(any(r == "reads" and target == "MissionLedger" for r, target, _ in triples))
            self.assertNotIn(
                ("entity", "ShouldNotAppear"),
                {(n["node_type"], n["display_name"]) for n in payload["nodes"]},
            )
            self.assertTrue(all(e["agreement_state"] == "declared_only" for e in helper_edges))

    def test_optional_function_manifests_are_declared_only_and_malformed_manifest_warns(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            good = root / "demo"
            good.mkdir()
            (good / "entry.ts").write_text("export default {}\n", encoding="utf-8")
            (good / "function.jsonc").write_text(
                json.dumps({
                    "name": "demoOps",
                    "entry": "entry.ts",
                    "automations": [{
                        "type": "scheduled",
                        "name": "demo_every_5",
                        "is_active": False,
                        "schedule_mode": "recurring",
                        "schedule_type": "simple",
                        "repeat_unit": "minutes",
                        "repeat_interval": 5,
                        "ends_type": "never",
                    }],
                }),
                encoding="utf-8",
            )
            bad = root / "bad"
            bad.mkdir()
            (bad / "entry.ts").write_text("export default {}\n", encoding="utf-8")
            (bad / "function.jsonc").write_text(
                r'{\n  "name": "badOps"\n}\n',
                encoding="utf-8",
            )

            payload = self.run_scan(root)

            self.assertEqual(payload["counts"]["code_files"], 2)
            self.assertEqual(payload["counts"]["manifest_files"], 2)
            self.assertEqual(payload["counts"]["files"], 4)
            self.assertFalse(payload["evidence_boundary"]["manifest_absence_is_negative_evidence"])
            self.assertFalse(payload["evidence_boundary"]["claims_provider_deployment_from_manifest"])
            self.assertTrue(any("Malformed function.jsonc" in w["message"] for w in payload["warnings"]))

            nodes = {n["locator"]: n for n in payload["nodes"]}
            self.assertIn("workflow:demoOps", nodes)
            self.assertIn("automation:demo_every_5", nodes)
            automation_meta = json.loads(nodes["automation:demo_every_5"]["notes"])
            self.assertEqual(automation_meta["evidence_lane"], "declared_only")
            self.assertFalse(automation_meta["is_active"])

            manifest_edges = [
                e for e in payload["edges"]
                if e.get("parser_mode", "").startswith("base44_function_manifest")
            ]
            self.assertTrue(any(e["relation_type"] == "owns" for e in manifest_edges))
            self.assertTrue(any(e["relation_type"] == "invokes" for e in manifest_edges))
            self.assertTrue(all(e["agreement_state"] == "declared_only" for e in manifest_edges))

    def test_output_is_deterministic_for_unchanged_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "main.py").write_text(
                "import math\n\ndef area(r):\n    return math.pi*r*r\n",
                encoding="utf-8",
            )

            first = self.run_scan(root)
            second = self.run_scan(root)

            self.assertEqual(first["source_revision"], second["source_revision"])
            self.assertEqual(first["nodes"], second["nodes"])
            self.assertEqual(first["edges"], second["edges"])

    def test_excluded_directories_are_pruned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "visible.py").write_text("import os\n", encoding="utf-8")
            hidden = root / "node_modules"
            hidden.mkdir()
            (hidden / "ignored.js").write_text("import x from 'x'\n", encoding="utf-8")

            payload = self.run_scan(root)

            self.assertEqual(payload["counts"]["files"], 1)
            self.assertEqual(
                [n["file_path"] for n in payload["nodes"] if n["node_type"] == "file"],
                ["visible.py"],
            )


if __name__ == "__main__":
    unittest.main()
