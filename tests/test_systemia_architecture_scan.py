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
            check=True,
            capture_output=True,
            text=True,
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

            self.assertEqual(payload["scanner_version"], "systemia-architecture-scan/1.0")
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
