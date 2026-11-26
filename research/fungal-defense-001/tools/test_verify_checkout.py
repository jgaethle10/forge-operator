#!/usr/bin/env python3
"""Offline regression tests for checkout admission, using temporary local Git."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from verify_checkout import inspect, REQUIRED_FILES


def git(root: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(root), *args], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class CheckoutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        git(self.repo, "init", "-q")
        git(self.repo, "config", "user.email", "test@localhost.invalid")
        git(self.repo, "config", "user.name", "Local Test")
        for filename in REQUIRED_FILES:
            target = self.repo / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("fixture\n", encoding="utf-8")
        git(self.repo, "add", ".")
        git(self.repo, "commit", "-qm", "test fixture")
        git(self.repo, "branch", "-M", "research/fungal-defense-001")
        git(self.repo, "remote", "add", "origin", "https://github.com/jgaethle10/forge-operator.git")

    def tearDown(self):
        self.temp.cleanup()

    def test_clean_branch_and_origin_admitted(self):
        result = inspect(self.repo)
        self.assertTrue(result["admitted"], result["problems"])
        self.assertFalse(result["hardware_identity_attested"])

    def test_dirty_checkout_rejected(self):
        (self.repo / REQUIRED_FILES[0]).write_text("changed\n", encoding="utf-8")
        self.assertFalse(inspect(self.repo)["admitted"])

    def test_untracked_files_rejected(self):
        (self.repo / "extra.txt").write_text("no", encoding="utf-8")
        self.assertFalse(inspect(self.repo)["admitted"])

    def test_wrong_branch_rejected(self):
        git(self.repo, "branch", "-m", "main")
        self.assertFalse(inspect(self.repo)["admitted"])

    def test_wrong_origin_rejected(self):
        git(self.repo, "remote", "set-url", "origin", "https://example.com/forge-operator.git")
        self.assertFalse(inspect(self.repo)["admitted"])

    def test_missing_required_file_rejected(self):
        (self.repo / REQUIRED_FILES[0]).unlink()
        self.assertFalse(inspect(self.repo)["admitted"])

    def test_non_git_directory_rejected(self):
        with tempfile.TemporaryDirectory() as path:
            self.assertFalse(inspect(Path(path))["admitted"])


if __name__ == "__main__":
    unittest.main()
