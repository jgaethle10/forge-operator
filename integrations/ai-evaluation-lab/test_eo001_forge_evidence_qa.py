"""Offline negative controls for Forge-owned EO-001 evidence review."""
from pathlib import Path
import copy
import importlib.util
import io
import json
import os
import tempfile
import unittest
import zipfile


HERE = Path(__file__).resolve().parent


def load_module(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


qa = load_module("eo001_forge_qa", "eo001-forge-evidence-qa.py")
packager = load_module("eo001_packager", "eo001-gate0-private-handoff.py")


def receipt():
    return {
        "schema": "evercraft.eo001.sovereign-inference-acceptance.v1",
        "state": "FIRST_INFERENCE_PASS",
        "real_local_inference": True,
        "model_sha256": qa.PINS["model"],
        "runtime_sha256": qa.PINS["runtime"],
        "model_reply_sha256": "a" * 64,
        "inference_seconds": 17.81,
        "child_processes_stopped": True,
        "synthetic_only": True,
        "production_services_modified": False,
    }


def review():
    return {
        "schema": "EO-FIRST-RUN-REVIEW/0.1.0",
        "evidence_coverage": "NOT_SUPPLIED",
        "hardware": {
            "state": "INFERENCE_REPORTED", "provenance": "UNVERIFIED_EXTERNAL",
            "eo001_decisions_established": False, "live_model_execution": None,
        },
        "cases": {}, "model_decision_counts": {}, "unmatched_receipts": 0,
        "problems": [], "live_model_execution": None, "promotion_allowed": False,
        "note": "Freeform details remain PRIVATE and do not enter the shared bundle.",
    }


def fixtures():
    a, b = receipt(), review()
    return packager.build_bundle(a, b), qa.canonical(a), qa.canonical(b)


def rebuild_zip(previous, replacement=None, extra=None):
    replacement = replacement or {}
    with zipfile.ZipFile(io.BytesIO(previous)) as original:
        entries = [(info.filename, original.read(info.filename)) for info in original.infolist()]
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        for name, data in entries:
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_STORED
            entry.external_attr = 0o600 << 16
            archive.writestr(entry, replacement.get(name, data))
        if extra:
            entry = zipfile.ZipInfo(extra, date_time=(1980, 1, 1, 0, 0, 0))
            entry.external_attr = 0o600 << 16
            archive.writestr(entry, b"PRIVATE EXTRA")
    return result.getvalue()


class ForgeReviewTests(unittest.TestCase):
    def test_valid_bundle_is_qa_passed_but_external_send_remains_held(self):
        bundle, rec, lab = fixtures()
        result = qa.audit(bundle, rec, lab)
        self.assertEqual(result["status"], "AUTOMATED_QA_PASSED_PRIVATE_HANDOFF_CANDIDATE")
        self.assertTrue(all(v == "PASS" for k, v in result["lanes"].items()
                            if k != "external_send_authority"))
        self.assertEqual(result["lanes"]["external_send_authority"], "HELD")
        self.assertFalse(result["external_send_authorized"])
        self.assertFalse(result["independent_lab_inspection_complete"])
        self.assertFalse(result["physical_inference_attested"])
        self.assertFalse(result["four_scenario_model_success"])

    def test_unexpected_zip_attachment_rejected(self):
        bundle, rec, lab = fixtures()
        with self.assertRaisesRegex(qa.ReviewBlocked, "ZIP_EXACT_MEMBER_SET"):
            qa.audit(rebuild_zip(bundle, extra="private.log"), rec, lab)

    def test_tampered_sha_or_manifest_rejected(self):
        bundle, rec, lab = fixtures()
        with zipfile.ZipFile(io.BytesIO(bundle)) as z:
            manifest = json.loads(z.read("handoff-manifest.json"))
        manifest["sha256"]["readiness-ten-fields.json"] = "0" * 64
        tampered = rebuild_zip(bundle, {"handoff-manifest.json": qa.canonical(manifest)})
        with self.assertRaisesRegex(qa.ReviewBlocked, "MANIFEST_INTEGRITY"):
            qa.audit(tampered, rec, lab)

    def test_undisclosed_source_change_rejected(self):
        bundle, rec, lab = fixtures()
        altered = json.loads(rec)
        altered["inference_seconds"] = 12
        with self.assertRaisesRegex(qa.ReviewBlocked, "RECEIPT_SOURCE_MISMATCH"):
            qa.audit(bundle, qa.canonical(altered), lab)

    def test_source_file_with_extra_secret_fails_closed(self):
        bundle, rec, lab = fixtures()
        altered = json.loads(rec)
        altered["secrets"] = "SECRET"
        with self.assertRaisesRegex(qa.ReviewBlocked, "RECEIPT_ALLOWLIST"):
            qa.audit(bundle, qa.canonical(altered), lab)

    def test_unsupported_external_attestation_rejected(self):
        bundle, rec, lab = fixtures()
        altered = json.loads(lab)
        altered["hardware"]["provenance"] = "VERIFIED_EXTERNAL"
        with self.assertRaisesRegex(qa.ReviewBlocked, "REVIEW_PROVENANCE"):
            qa.audit(bundle, rec, qa.canonical(altered))

    def test_payment_authorization_not_accepted(self):
        bundle, rec, lab = fixtures()
        altered = json.loads(lab)
        altered["promotion_allowed"] = True
        with self.assertRaisesRegex(qa.ReviewBlocked, "REVIEW_CONSISTENCY"):
            qa.audit(bundle, rec, qa.canonical(altered))

    def test_wrong_receipt_pin_rejected(self):
        bundle, rec, lab = fixtures()
        altered = json.loads(rec)
        altered["model_sha256"] = "0" * 64
        with self.assertRaisesRegex(qa.ReviewBlocked, "RECEIPT_PIN"):
            qa.audit(bundle, qa.canonical(altered), lab)

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaisesRegex(qa.ReviewBlocked, "DUPLICATE_JSON_KEY"):
            qa.load_strict(b'{"schema": 1, "schema": 2}')

    def test_corrupt_archive_rejected(self):
        _, rec, lab = fixtures()
        with self.assertRaisesRegex(qa.ReviewBlocked, "ZIP_INVALID"):
            qa.audit(b"not-a-zip", rec, lab)

    def test_no_overwrite_and_mode_0600(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            os.chmod(base, 0o700)
            bundle, rec, lab = fixtures()
            items = [base / name for name in ("bundle.zip", "receipt.json", "review.json")]
            for file, data in zip(items, (bundle, rec, lab)):
                file.write_bytes(data)
                os.chmod(file, 0o600)
            output = base / "forge-qa.json"
            result = qa.inspect_bundle(*items, output)
            self.assertEqual(result["lanes"]["forge_integrity"], "PASS")
            self.assertEqual(os.stat(output).st_mode & 0o777, 0o600)
            self.assertFalse(json.loads(output.read_text())["external_send_authorized"])
            with self.assertRaises(FileExistsError):
                qa.inspect_bundle(*items, output)

    def test_private_file_permission_required(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "x.json"
            file.write_text("{}")
            os.chmod(file, 0o644)
            with self.assertRaisesRegex(qa.ReviewBlocked, "PRIVATE_FILE_SECURITY"):
                qa.read_private(file)

    def test_no_symlink_source(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "x.json"
            file.write_text("{}")
            os.chmod(file, 0o600)
            link = Path(folder) / "link.json"
            link.symlink_to(file)
            with self.assertRaisesRegex(qa.ReviewBlocked, "PRIVATE_FILE_UNAVAILABLE"):
                qa.read_private(link)


if __name__ == "__main__":
    unittest.main()
