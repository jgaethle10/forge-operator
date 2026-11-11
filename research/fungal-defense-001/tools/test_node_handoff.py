#!/usr/bin/env python3
"""Offline handoff tests with fake Git/Python; never contacts GitHub or a node."""
from __future__ import annotations
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parent / "validate_on_owned_node.sh"
PIN = "c" * 40
OTHER = "d" * 40


class NodeHandoffTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        git_stub = bin_dir / "git"
        git_stub.write_text('''#!/bin/sh
if [ "$1" = clone ]; then
  for arg do last="$arg"; done
  mkdir -p -- "$last"
  printf 'cloned' > "$MOCK_CLONE_MARKER"
  exit 0
fi
if [ "$1" = -C ] && [ "$3" = rev-parse ]; then
  printf '%s\\n' "$MOCK_HEAD"
  exit 0
fi
exit 1
''', encoding="utf-8")
        python_stub = bin_dir / "python3"
        python_stub.write_text('''#!/bin/sh
printf 'invoked' > "$MOCK_RUNNER_MARKER"
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then
    shift
    printf '{"status":"pass"}\\n' > "$1"
  fi
  shift
done
exit 0
''', encoding="utf-8")
        git_stub.chmod(0o700)
        python_stub.chmod(0o700)
        self.clone_marker = self.root / "clone-marker"
        self.runner_marker = self.root / "runner-marker"
        self.env = {**os.environ,
                    "PATH": f"{bin_dir}:{os.environ.get('PATH', '')}",
                    "XDG_STATE_HOME": str(self.root / "state"),
                    "MOCK_HEAD": PIN,
                    "MOCK_CLONE_MARKER": str(self.clone_marker),
                    "MOCK_RUNNER_MARKER": str(self.runner_marker)}

    def invoke(self, *args, env=None):
        return subprocess.run(["bash", str(SCRIPT), *args],
                              env=env or self.env, capture_output=True,
                              text=True, check=False, timeout=10)

    def test_missing_pin_fails_before_clone(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.clone_marker.exists())
        self.assertFalse(self.runner_marker.exists())

    def test_malformed_pin_fails_before_clone(self):
        result = self.invoke("not-a-commit")
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.clone_marker.exists())
        self.assertFalse(self.runner_marker.exists())

    def test_changed_branch_commit_fails_before_execution(self):
        result = self.invoke(OTHER, "evercraft-node002-nextgen")
        self.assertEqual(result.returncode, 3, result.stderr)
        self.assertTrue(self.clone_marker.exists())
        self.assertFalse(self.runner_marker.exists())
        state = self.root / "state/evercraft/fungal-defense"
        self.assertEqual(list(state.glob("source.*")), [])
        self.assertEqual(list(state.glob("node-validation.*.json")), [])

    def test_matching_pin_invokes_validator_and_saves_private_receipt(self):
        result = self.invoke(PIN, "evercraft-node002-nextgen")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.runner_marker.exists())
        state = self.root / "state/evercraft/fungal-defense"
        receipts = list(state.glob("node-validation.*.json"))
        self.assertEqual(len(receipts), 1)
        self.assertIn('"status":"pass"', receipts[0].read_text())
        self.assertEqual(receipts[0].stat().st_mode & 0o077, 0)
        self.assertEqual(list(state.glob("source.*")), [])
        self.assertIn("not hardware attestation", result.stdout)


if __name__ == "__main__":
    unittest.main()
