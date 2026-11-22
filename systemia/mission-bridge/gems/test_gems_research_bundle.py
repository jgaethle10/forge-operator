"""Synthetic path/authority smoke tests for the offline GEMS research launcher.

No GeoDAWN files, private tokens, network operations or training jobs are used.
"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("execute_gems_research_bundle.sh")


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.data = self.root / "data"
        self.data.mkdir()
        self.archive = self.root / "gems001.zip"
        self.archive.write_bytes(b"this-is-not-an-authorized-archive")
        self.private = self.root / "private"
        self.private.mkdir()
        self.out = self.private / "one-new-research-result"

    def invoke(self, mode="hard", data=None, archive=None, out=None, extra_env=None):
        env = os.environ.copy()
        env.pop("GEMS_REPEAT", None)
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            ["bash", str(SCRIPT), mode,
             str(self.data if data is None else data),
             str(self.archive if archive is None else archive),
             str(self.out if out is None else out)],
            capture_output=True, text=True, timeout=15, env=env
        )

    def test_syntax(self):
        result = subprocess.run(["bash", "-n", str(SCRIPT)],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_invalid_mode_without_creating_output(self):
        result = self.invoke(mode="submit")
        self.assertEqual(result.returncode, 64)
        self.assertFalse(self.out.exists())

    def test_missing_source_fail_closed(self):
        self.archive.unlink()
        result = self.invoke()
        self.assertEqual(result.returncode, 65)
        self.assertFalse(self.out.exists())

    def test_rejects_source_symlink(self):
        link = self.root / "link.zip"
        link.symlink_to(self.archive)
        result = self.invoke(archive=link)
        self.assertEqual(result.returncode, 65)
        self.assertFalse(self.out.exists())

    def test_rejects_output_within_source(self):
        dest = self.data / "research"
        result = self.invoke(out=dest)
        self.assertEqual(result.returncode, 66)
        self.assertFalse(dest.exists())

    def test_rejects_output_collision_and_symlink(self):
        self.out.mkdir()
        result = self.invoke()
        self.assertEqual(result.returncode, 66)
        self.out.rmdir()
        self.out.symlink_to(self.data, target_is_directory=True)
        result = self.invoke()
        self.assertEqual(result.returncode, 66)
        self.out.unlink()

    def test_refuses_repeat_mode_by_default(self):
        result = self.invoke(extra_env={"GEMS_REPEAT": "1"})
        self.assertEqual(result.returncode, 67)
        self.assertFalse(self.out.exists())

    def test_official_source_hash_gate_before_output_or_training(self):
        for mode in ("hard", "directional", "both"):
            with self.subTest(mode=mode):
                result = self.invoke(mode=mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.out.exists(),
                                 "Unverified files must never create a research result")
                self.assertNotIn("HANDOFF COMPLETE", result.stdout)


if __name__ == "__main__":
    unittest.main()
