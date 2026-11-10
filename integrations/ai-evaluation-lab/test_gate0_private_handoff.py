"""Synthetic-only tests for the private Gate 0 handoff ZIP. No network or model."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

source = Path(__file__).resolve().with_name("eo001-gate0-private-handoff.py")
spec = importlib.util.spec_from_file_location("eo001_gate0_handoff", source)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def sample_receipt():
    return {
        "schema": "evercraft.eo001.sovereign-inference-acceptance.v1",
        "state": "FIRST_INFERENCE_PASS",
        "real_local_inference": True,
        "model_sha256": mod.MODEL_SHA,
        "runtime_sha256": mod.RUNTIME_SHA,
        "model_reply_sha256": "a" * 64,
        "inference_seconds": 17.81,
        "child_processes_stopped": True,
        "synthetic_only": True,
        "production_services_modified": False,
    }


def sample_review():
    return {
        "schema": "EO-FIRST-RUN-REVIEW/0.1.0",
        "evidence_coverage": "NOT_SUPPLIED",
        "hardware": {
            "state": "INFERENCE_REPORTED",
            "provenance": "UNVERIFIED_EXTERNAL",
            "live_model_execution": None,
            "eo001_decisions_established": False,
        },
        "cases": {}, "model_decision_counts": {}, "unmatched_receipts": 0,
        "problems": [], "live_model_execution": None,
        "promotion_allowed": False,
        "note": "sensitive note must never enter the handoff!",
    }


class GateZeroTests(unittest.TestCase):
    def test_exact_three_members_and_explicit_no_attestation(self):
        out = mod.build_bundle(sample_receipt(), sample_review())
        with zipfile.ZipFile(io.BytesIO(out)) as z:
            self.assertEqual(set(z.namelist()), {
                "readiness-ten-fields.json", "lab-review-status.json",
                "handoff-manifest.json"
            })
            manifest = json.loads(z.read("handoff-manifest.json"))
            review = json.loads(z.read("lab-review-status.json"))
            receipt = json.loads(z.read("readiness-ten-fields.json"))
            self.assertFalse(manifest["independent_lab_has_inspected_payload"])
            self.assertFalse(manifest["four_case_model_decisions_established"])
            self.assertFalse(manifest["production_authority_granted"])
            self.assertEqual(set(receipt), mod.RECEIPT_FIELDS)
            self.assertNotIn("note", review)
            self.assertNotIn("sensitive note", out.decode("latin1"))
            for name in ("readiness-ten-fields.json", "lab-review-status.json"):
                import hashlib
                self.assertEqual(manifest["sha256"][name], hashlib.sha256(z.read(name)).hexdigest())

    def test_receipt_extras_rejected_no_silent_secret_dropping(self):
        r = sample_receipt()
        r["gateway_token"] = "PRIVATE"
        with self.assertRaisesRegex(mod.Blocked, "TEN_FIELD_RECEIPT_REQUIRED"):
            mod.build_bundle(r, sample_review())

    def test_missing_receipt_field_rejected(self):
        r = sample_receipt()
        del r["production_services_modified"]
        with self.assertRaises(mod.Blocked):
            mod.build_bundle(r, sample_review())

    def test_claim_of_physical_provenance_rejected(self):
        r = sample_review()
        r["hardware"]["provenance"] = "VERIFIED_PHYSICAL"
        with self.assertRaises(mod.Blocked):
            mod.build_bundle(sample_receipt(), r)

    def test_model_decision_results_not_mislabeled_gate_zero(self):
        r = sample_review()
        r["cases"] = {"none": {"workflow_verdict": {}}}
        with self.assertRaises(mod.Blocked):
            mod.build_bundle(sample_receipt(), r)

    def test_missing_or_unauthorized_promotion_rejected(self):
        for value in (True, None, "false"):
            r = sample_review()
            r["promotion_allowed"] = value
            with self.subTest(value=value), self.assertRaises(mod.Blocked):
                mod.build_bundle(sample_receipt(), r)

    def test_invalid_reply_sha_or_source_pins_rejected(self):
        for key, value in [("model_reply_sha256", "INVALID"), ("model_sha256", "0" * 64)]:
            r = sample_receipt()
            r[key] = value
            with self.subTest(key=key), self.assertRaises(mod.Blocked):
                mod.build_bundle(r, sample_review())

    def test_output_private_and_inputs_unmodified_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            os.chmod(root, 0o700)
            receipt = root / "receipt.json"
            review = root / "review.json"
            target = root / "handoff.zip"
            receipt.write_text(json.dumps(sample_receipt()))
            review.write_text(json.dumps(sample_review()))
            os.chmod(receipt, 0o600)
            os.chmod(review, 0o600)
            before = (receipt.read_bytes(), review.read_bytes())
            mod.export(receipt, review, target)
            self.assertEqual(os.stat(target).st_mode & 0o777, 0o600)
            self.assertEqual(before, (receipt.read_bytes(), review.read_bytes()))
            with self.assertRaises(FileExistsError):
                mod.export(receipt, review, target)

    def test_world_readable_source_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            os.chmod(root, 0o700)
            source = root / "receipt.json"
            source.write_text(json.dumps(sample_receipt()))
            os.chmod(source, 0o644)
            with self.assertRaisesRegex(mod.Blocked, "PRIVATE_INPUT_PERMISSION_OR_SIZE"):
                mod.read_private_json(source)

    def test_duplicate_json_keys_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "bad.json"
            source.write_text('{"schema": "x", "schema": "y"}')
            os.chmod(source, 0o600)
            with self.assertRaisesRegex(mod.Blocked, "DUPLICATE_JSON_KEY"):
                mod.read_private_json(source)

    def test_input_symlinks_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "receipt.json"
            source.write_text(json.dumps(sample_receipt()))
            os.chmod(source, 0o600)
            link = root / "link.json"
            link.symlink_to(source)
            with self.assertRaisesRegex(mod.Blocked, "PRIVATE_REGULAR_INPUT_REQUIRED"):
                mod.read_private_json(link)

    def test_stable_bundle_for_same_verified_inputs(self):
        self.assertEqual(mod.build_bundle(sample_receipt(), sample_review()),
                         mod.build_bundle(sample_receipt(), sample_review()))


if __name__ == "__main__":
    unittest.main()
