"""Fail-closed private status export tests, using isolated sample receipts."""
import importlib.util
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

P = Path(__file__).resolve().parents[1] / "engineering" / "aiw_private_status_export.py"
spec = importlib.util.spec_from_file_location("aiw_private_status_export", P)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
NOW = datetime(2026, 11, 19, 7, 0, tzinfo=timezone.utc)


class StatusExportTests(unittest.TestCase):
    def setup_files(self, base):
        registry = Path(base) / "registry.json"
        receipt_dir = Path(base) / "receipts"
        receipt_dir.mkdir()
        heartbeat = Path(base) / "heartbeat.json"
        registry.write_text(json.dumps({"sources": [{"id": "bridge", "url": "https://agency.example/bridge"}]}))
        return registry, receipt_dir, heartbeat

    def test_no_receipts_is_not_healthy(self):
        with TemporaryDirectory() as d:
            reg, receipts, hb = self.setup_files(d)
            result = mod.collect_status(reg, receipts, hb, now=NOW)
            self.assertEqual(result["national_collector"]["state"], "awaiting_first_cycle")
            self.assertEqual(result["owned_pnw_evidence"]["state"], "unverified")
            self.assertFalse(result["public_release_ready"])
            self.assertFalse(result["national_collector"]["scheduled_300_second_cadence_verified"])

    def test_fresh_report_and_heartbeat_do_not_prove_live_release(self):
        with TemporaryDirectory() as d:
            reg, receipts, hb = self.setup_files(d)
            at = (NOW - timedelta(seconds=30)).isoformat().replace("+00:00", "Z")
            record = {"cycle_id": "cycle1", "collector_id": "owned", "started_at": at, "finished_at": at,
                      "sources": [{"id": "bridge", "url": "https://agency.example/bridge",
                                   "result": "ok", "checked_at": at, "content_sha256": "a" * 64,
                                   "error_code": None}]}
            validator = mod.load_receipt_module()
            validated = validator.validate_cycle(record, {"bridge": "https://agency.example/bridge"})
            (receipts / "cycle1.json").write_text(json.dumps(validated))
            hb.write_text(json.dumps({
                "schema": "evercraft.aiw.heartbeat.v1",
                "scope": "owned_pnw_v015_service_not_national_site",
                "status": "passed", "checked_at_utc": at,
                "evidence": {"dataset_rows": 21590, "national_complete": False,
                             "live_emergency_check": False, "latest_source_refresh_verified": False}}))
            with patch.object(validator, "status", wraps=validator.status):
                result = mod.collect_status(reg, receipts, hb, now=NOW)
            self.assertEqual(result["national_collector"]["state"], "healthy")
            self.assertEqual(result["owned_pnw_evidence"]["state"], "healthy_snapshot")
            self.assertFalse(result["public_release_ready"])
            self.assertFalse(result["owned_pnw_evidence"]["national_coverage"])
            self.assertFalse(result["owned_pnw_evidence"]["emergency_feed_connected"])
            self.assertNotIn("agency.example", json.dumps(result))
            output = Path(d) / "private.json"
            mod.save_atomic(output, result)
            self.assertEqual(json.loads(output.read_text()), result)

    def test_stale_heartbeat_is_rejected(self):
        with TemporaryDirectory() as d:
            reg, receipts, hb = self.setup_files(d)
            hb.write_text(json.dumps({"schema": "evercraft.aiw.heartbeat.v1", "status": "passed",
                                     "checked_at_utc": (NOW - timedelta(days=1)).isoformat()}))
            result = mod.collect_status(reg, receipts, hb, now=NOW)
            self.assertEqual(result["owned_pnw_evidence"]["state"], "stale_or_invalid")

    def test_bad_registry_fails_closed(self):
        with TemporaryDirectory() as d:
            reg, receipts, hb = self.setup_files(d)
            reg.write_text('{"sources":[]}')
            with self.assertRaises(ValueError):
                mod.collect_status(reg, receipts, hb, now=NOW)


if __name__ == "__main__":
    unittest.main()
