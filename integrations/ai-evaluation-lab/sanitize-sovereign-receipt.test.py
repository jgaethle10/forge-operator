"""Tests for exact ten-field Sovereign AI Lab handoff copy."""
import importlib.util
from pathlib import Path
import unittest

here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sanitize_receipt", here / "sanitize-sovereign-receipt.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)

def fixture():
    return {
        "schema": app.SCHEMA,
        "state": "FIRST_INFERENCE_PASS",
        "real_local_inference": True,
        "model_sha256": app.EXPECTED_MODEL,
        "runtime_sha256": app.EXPECTED_RUNTIME,
        "model_reply_sha256": "a" * 64,
        "inference_seconds": 17.81,
        "child_processes_stopped": True,
        "synthetic_only": True,
        "production_services_modified": False,
        "stage_root": "/private/home/coach",
        "gateway_port": 18901,
        "model_port": 18902,
        "model_reply_excerpt": "SECRET TEST ANSWER",
        "gateway_api_token": "must never copy",
        "error": "some sensitive log",
    }

class SanitizationTests(unittest.TestCase):
    def test_exact_ten_fields_and_no_private_metadata(self):
        selected = app.select(fixture())
        self.assertEqual(tuple(selected), app.FIELDS)
        self.assertNotIn("stage_root", selected)
        self.assertNotIn("gateway_port", selected)
        self.assertNotIn("model_reply_excerpt", selected)
        self.assertNotIn("gateway_api_token", selected)

    def test_original_fields_missing_fail_closed(self):
        record = fixture()
        del record["production_services_modified"]
        with self.assertRaisesRegex(ValueError, "receipt_missing_required_fields"):
            app.select(record)

    def test_synthetic_provenance_must_match(self):
        record = fixture()
        record["synthetic_only"] = False
        with self.assertRaisesRegex(ValueError, "receipt_assertions_not_met"):
            app.select(record)
        record = fixture()
        record["model_sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "model_sha256_mismatch"):
            app.select(record)

    def test_incomplete_or_untrusted_receipt_rejected(self):
        record = fixture()
        record["state"] = "FIRST_INFERENCE_BLOCKED"
        with self.assertRaisesRegex(ValueError, "original_receipt_not_a_pass"):
            app.select(record)
        record = fixture()
        record["inference_seconds"] = True
        with self.assertRaisesRegex(ValueError, "inference_seconds_invalid"):
            app.select(record)

if __name__ == "__main__":
    unittest.main()
