#!/usr/bin/env python3
"""Offline crash/recovery regression tests for the local research mission runner."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name("local_mission_runner.py")
spec = importlib.util.spec_from_file_location("local_mission_runner", MODULE)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

class Args:
    endpoint = "http://127.0.0.1:8080/v1/chat/completions"
    timeout = 10
    mission_id = "crash-recovery-test"
    stop_after = None
    def __init__(self, db):
        self.db = str(db)

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.args = Args(Path(self.temp.name) / "state.sqlite3")
        self.calls = []
        self.responses = {
            "analyst": {"record_a_kw": 12, "record_b_kw": 10},
            "auditor": {"discrepancy_kw": 2, "conflict_detected": True},
            "supervisor": {"verified_discrepancy_kw": 2, "status": "conflict", "recommendation": "Verify measurements"},
        }

    def fake_infer(self, stage, prior, endpoint, timeout):
        self.calls.append(stage)
        return self.responses[stage]

    def test_stop_and_resume_without_duplicate_inference(self):
        self.args.stop_after = "analyst"
        with patch.object(runner, "infer", side_effect=self.fake_infer):
            runner.run(self.args)
        self.assertEqual(self.calls, ["analyst"])
        self.args.stop_after = None
        with patch.object(runner, "infer", side_effect=self.fake_infer):
            runner.run(self.args)
        self.assertEqual(self.calls, ["analyst", "auditor", "supervisor"])
        receipt = json.loads((Path(self.temp.name) / "crash-recovery-test.receipt.json").read_text())
        self.assertEqual(receipt["state"], "completed")

    def test_failure_after_checkpoint_then_resume(self):
        def interrupt(stage, prior, endpoint, timeout):
            if stage == "auditor":
                raise RuntimeError("simulated process failure after analyst commit")
            return self.fake_infer(stage, prior, endpoint, timeout)
        with patch.object(runner, "infer", side_effect=interrupt):
            with self.assertRaisesRegex(RuntimeError, "simulated process failure"):
                runner.run(self.args)
        with patch.object(runner, "infer", side_effect=self.fake_infer):
            runner.run(self.args)
        self.assertEqual(self.calls, ["analyst", "auditor", "supervisor"])

    def test_tampered_checkpoint_fails_closed(self):
        self.args.stop_after = "analyst"
        with patch.object(runner, "infer", side_effect=self.fake_infer):
            runner.run(self.args)
        with sqlite3.connect(self.args.db) as db:
            db.execute("UPDATE stages SET payload=? WHERE stage='analyst'", ('{"record_a_kw":12,"record_b_kw":11}',))
        self.args.stop_after = None
        with patch.object(runner, "infer", side_effect=self.fake_infer):
            with self.assertRaisesRegex(ValueError, "digest mismatch"):
                runner.run(self.args)
        self.assertEqual(self.calls, ["analyst"])

    def test_invalid_mission_id_rejected(self):
        self.args.mission_id = "../escape"
        with self.assertRaisesRegex(ValueError, "invalid mission id"):
            runner.run(self.args)

if __name__ == "__main__":
    unittest.main(verbosity=2)
