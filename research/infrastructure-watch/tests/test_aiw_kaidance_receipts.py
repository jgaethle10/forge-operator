"""Offline tests for AIW per-source monitoring receipts. No remote fetches."""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

MODULE = Path(__file__).resolve().parents[1] / "engineering" / "aiw_kaidance_receipts.py"
spec = importlib.util.spec_from_file_location("aiw_kaidance_receipts", MODULE)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.registry = self.root / "registry.json"
        self.registry.write_text(json.dumps({"sources": [
            {"id": "bridge", "url": "https://agency.example/bridge"},
            {"id": "minutes", "url": "https://agency.example/minutes"}]}))
        self.receipts = self.root / "receipts"
        self.finished = datetime.now(timezone.utc) - timedelta(seconds=30)
        self.started = self.finished - timedelta(seconds=15)
        self.t = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ")
        self.cycle = {
            "cycle_id": "test-001", "collector_id": "test-collector",
            "started_at": self.t(self.started), "finished_at": self.t(self.finished),
            "sources": [self.observation("bridge"), self.observation("minutes")],
        }

    def observation(self, sid):
        return {"id": sid, "url": f"https://agency.example/{sid}", "result": "ok",
                "checked_at": self.t(self.finished), "content_sha256": "a" * 64, "error_code": None}

    def save(self):
        inp = self.root / "cycle.json"
        inp.write_text(json.dumps(self.cycle))
        return api.record_receipt(self.registry, inp, self.receipts)

    def test_no_cycle_is_not_a_running_heartbeat(self):
        s = api.status(self.registry, self.receipts)
        self.assertEqual(s["state"], "awaiting_first_cycle")
        self.assertFalse(s["scheduler_registration_verified"])

    def test_full_cycle_is_fresh_but_not_scheduler_proof(self):
        self.assertTrue(self.save()["complete"])
        s = api.status(self.registry, self.receipts)
        self.assertEqual(s["state"], "healthy")
        self.assertEqual(s["sources_ok"], 2)
        self.assertFalse(s["scheduler_registration_verified"])
        with self.assertRaises(FileExistsError):
            self.save()

    def test_missing_source_remains_not_checked(self):
        self.cycle["sources"].pop()
        self.save()
        s = api.status(self.registry, self.receipts)
        self.assertEqual(s["state"], "degraded")
        self.assertEqual(s["sources_not_checked"], ["minutes"])
        self.assertEqual(s["sources_ok"], 1)

    def test_failed_source_requires_error_and_cannot_fake_hash(self):
        self.cycle["sources"][1]["result"] = "failed"
        with self.assertRaisesRegex(ValueError, "Failed/skipped"):
            self.save()
        self.cycle["sources"][1]["content_sha256"] = None
        self.cycle["sources"][1]["error_code"] = "HTTP_503"
        self.save()
        s = api.status(self.registry, self.receipts)
        self.assertEqual(s["sources_failed"], ["minutes"])
        self.assertEqual(s["state"], "degraded")

    def test_tampered_url_and_duplicate_sources_are_rejected(self):
        self.cycle["sources"][1]["url"] = "https://different.example/"
        with self.assertRaisesRegex(ValueError, "mismatched registry"):
            self.save()
        self.cycle["sources"][1] = self.observation("bridge")
        with self.assertRaisesRegex(ValueError, "repeated source"):
            self.save()

    def test_out_of_cycle_observation_rejected(self):
        self.cycle["sources"][0]["checked_at"] = self.t(self.started - timedelta(minutes=1))
        with self.assertRaisesRegex(ValueError, "outside cycle"):
            self.save()

    def test_old_cycle_is_stale_even_if_all_sources_ok(self):
        self.save()
        s = api.status(self.registry, self.receipts, now=self.finished + timedelta(seconds=601))
        self.assertEqual(s["state"], "stale")

    def test_corrupt_saved_receipt_fails_closed(self):
        dest = Path(self.save()["saved"])
        data = json.loads(dest.read_text())
        data["source_count_ok"] = 999
        dest.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "validation failed"):
            api.status(self.registry, self.receipts)


if __name__ == "__main__":
    unittest.main()
