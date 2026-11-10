#!/usr/bin/env python3
"""Integration checks for the offline validation runner using local Git fixtures."""
from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import run_owned_validation as runner
from verify_checkout import REQUIRED_FILES


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        self.project = self.repo / "research/fungal-defense-001"
        self.tools = self.project / "tools"
        self.tools.mkdir(parents=True)
        here = Path(__file__).resolve().parent
        for file in ("verify_checkout.py", "run_owned_validation.py"):
            shutil.copyfile(here / file, self.tools / file)
        for filename in REQUIRED_FILES:
            target = self.repo / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("fixture\n", encoding="utf-8")
        for name in ("validate_surveillance.py", "check_observatory.py", "release_gate.py"):
            (self.tools / name).write_text("print('PASS: fixture')\n", encoding="utf-8")
        (self.tools / "test_dummy.py").write_text(
            "import unittest\nclass Smoke(unittest.TestCase):\n"
            "    def test_ok(self): self.assertTrue(True)\n", encoding="utf-8")
        git(self.repo, "init", "-q")
        git(self.repo, "config", "user.name", "Local Test")
        git(self.repo, "config", "user.email", "test@localhost.invalid")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-qm", "fixture")
        git(self.repo, "branch", "-M", "research/fungal-defense-001")
        git(self.repo, "remote", "add", "origin", "https://github.com/jgaethle10/forge-operator.git")

    def tearDown(self):
        self.tmp.cleanup()

    def execute(self):
        out = StringIO()
        with patch.object(runner, "ROOT", self.project), patch.object(runner, "TOOLS", self.tools), \
             patch.object(sys, "argv", ["run_owned_validation.py"]), redirect_stdout(out):
            exit_code = runner.main()
        return exit_code, json.loads(out.getvalue())

    def test_clean_canonical_checkout_has_test_only_pass(self):
        status, receipt = self.execute()
        self.assertEqual(status, 0)
        self.assertEqual(receipt["status"], "pass")
        self.assertTrue(receipt["checkout_admitted"])
        self.assertTrue(receipt["git_worktree_clean"])
        self.assertEqual(len(receipt["results"]), 6)
        self.assertFalse(receipt["node_hardware_attested"])
        self.assertFalse(receipt["public_release_approved"])

    def test_modified_worktree_fails_before_tests(self):
        (self.project / "observatory-v0.2.html").write_text("dirty\n", encoding="utf-8")
        status, receipt = self.execute()
        self.assertEqual(status, 1)
        self.assertEqual(receipt["status"], "fail")
        self.assertFalse(receipt["checkout_admitted"])
        self.assertEqual(len(receipt["results"]), 1)

    def test_wrong_origin_fails_before_tests(self):
        git(self.repo, "remote", "set-url", "origin", "https://example.com/forge-operator.git")
        status, receipt = self.execute()
        self.assertEqual(status, 1)
        self.assertFalse(receipt["checkout_admitted"])
        self.assertEqual(len(receipt["results"]), 1)

    def test_failed_validation_does_not_pass_receipt(self):
        (self.tools / "validate_surveillance.py").write_text("raise SystemExit(3)\n", encoding="utf-8")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-qm", "failing validator fixture")
        status, receipt = self.execute()
        self.assertEqual(status, 1)
        self.assertTrue(receipt["checkout_admitted"])
        self.assertEqual(receipt["status"], "fail")
        self.assertFalse(receipt["results"][1]["passed"])


if __name__ == "__main__":
    unittest.main()
