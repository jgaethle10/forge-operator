"""Synthetic-only proofs for the EO-001 one-command Forge QA runner."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
from unittest import TestCase, main, mock
import tempfile


HERE = Path(__file__).resolve().parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = load("eo001_runner", "eo001-forge-qa-runner.py")
qa = load("eo001_qa_for_runner", "eo001-forge-evidence-qa.py")
packager = load("eo001_packager_for_runner", "eo001-gate0-private-handoff.py")


def receipt():
    return {
        "schema": "evercraft.eo001.sovereign-inference-acceptance.v1",
        "state": "FIRST_INFERENCE_PASS", "real_local_inference": True,
        "model_sha256": qa.PINS["model"], "runtime_sha256": qa.PINS["runtime"],
        "model_reply_sha256": "a" * 64, "inference_seconds": 17.81,
        "child_processes_stopped": True, "synthetic_only": True,
        "production_services_modified": False,
    }


def review():
    return {
        "schema": "EO-FIRST-RUN-REVIEW/0.1.0",
        "evidence_coverage": "NOT_SUPPLIED",
        "hardware": {
            "state": "INFERENCE_REPORTED", "provenance": "UNVERIFIED_EXTERNAL",
            "live_model_execution": None, "eo001_decisions_established": False,
        },
        "cases": {}, "model_decision_counts": {}, "unmatched_receipts": 0,
        "problems": [], "live_model_execution": None, "promotion_allowed": False,
        "note": "private comment omitted from packed report",
    }


class RunnerTests(TestCase):
    def mkfiles(self, home):
        out = home / ".local/state/evercraft/eo001-handoff"
        case = out / "gate0-FAKE"
        case.mkdir(parents=True, mode=0o700)
        os.chmod(out, 0o700)
        os.chmod(case, 0o700)
        original = receipt()
        lab = review()
        for name, content in (
            ("sanitized-receipt.json", qa.canonical(original)),
            ("independent-review.json", qa.canonical(lab)),
            ("gate0-private-handoff.zip", packager.build_bundle(original, lab)),
        ):
            p = case / name
            p.write_bytes(content)
            os.chmod(p, 0o600)
        return case

    def test_private_handoff_runs_automatically_without_dumping_json(self):
        with tempfile.TemporaryDirectory() as dirname:
            home = Path(dirname)
            self.mkfiles(home)
            output = io.StringIO()
            with mock.patch.object(runner.Path, "home", return_value=home), contextlib.redirect_stdout(output):
                code = runner.main()
            self.assertEqual(code, 0)
            self.assertIn("EVERCRAFT_FORGE_PRIVATE_QA: PASS", output.getvalue())
            self.assertIn("OUTBOUND_ACTION: HELD", output.getvalue())
            self.assertNotIn("private comment", output.getvalue())
            qa_path = home / ".local/state/evercraft/eo001-handoff/gate0-FAKE/forge-evidence-qa.v1.json"
            self.assertEqual(qa_path.stat().st_mode & 0o777, 0o600)
            self.assertFalse(json.loads(qa_path.read_text())["external_send_authorized"])

    def test_fails_closed_if_no_handoff(self):
        with tempfile.TemporaryDirectory() as dirname:
            output = io.StringIO()
            with mock.patch.object(runner.Path, "home", return_value=Path(dirname)), contextlib.redirect_stdout(output):
                result = runner.main()
            self.assertEqual(result, 2)
            self.assertIn("BLOCKED", output.getvalue())

    def test_multiple_bundles_not_ambiguous_and_no_output(self):
        with tempfile.TemporaryDirectory() as dirname:
            home = Path(dirname)
            self.mkfiles(home)
            self.mkfiles(home).parent.joinpath("gate0-SECOND").mkdir(mode=0o700)
            (home / ".local/state/evercraft/eo001-handoff/gate0-SECOND/gate0-private-handoff.zip").write_bytes(b"x")
            output = io.StringIO()
            with mock.patch.object(runner.Path, "home", return_value=home), contextlib.redirect_stdout(output):
                result = runner.main()
            self.assertEqual(result, 2)
            self.assertIn("EXACTLY_ONE_GATE0_BUNDLE_REQUIRED", output.getvalue())

    def test_repeated_run_cannot_overwrite_qa_receipt(self):
        with tempfile.TemporaryDirectory() as dirname:
            home = Path(dirname)
            self.mkfiles(home)
            with mock.patch.object(runner.Path, "home", return_value=home), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(runner.main(), 0)
                self.assertEqual(runner.main(), 2)


if __name__ == "__main__":
    main()
