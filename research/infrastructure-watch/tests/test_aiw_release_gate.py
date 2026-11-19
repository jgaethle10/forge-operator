"""Offline contract regression for the AIW release gate."""
import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import unittest

module = Path(__file__).resolve().parents[1] / "engineering" / "aiw_release_gate.py"
spec = importlib.util.spec_from_file_location("aiw_release_gate", module)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
NOW = datetime(2026, 11, 19, 5, 0, tzinfo=timezone.utc)


def verified():
    ts = NOW.isoformat()
    return {"schema": "evercraft.aiw.release-evidence.v1",
            "founder_publication_approval": True,
            "gates": {
                "pnw_heartbeat": {"status": "verified", "checked_at_utc": ts, "receipt_ref": "private:pnw"},
                "national_collector": {"status": "verified", "checked_at_utc": ts, "receipt_ref": "private:national",
                                       "all_nine_sources_checked": True,
                                       "three_scheduled_cycles_verified": True, "yakima_minutes_status": "ok"},
                "owned_host": {"status": "verified", "checked_at_utc": ts, "receipt_ref": "private:host",
                               "kaidance_300s_schedule_verified": True, "rollback_test_verified": True},
                "private_site": {"status": "verified", "checked_at_utc": ts, "receipt_ref": "private:site",
                                 "private_access_verified": True, "national_ui_evidence_binding_verified": True,
                                 "mobile_review_verified": True}}}


class ReleaseGateTests(unittest.TestCase):
    def test_absent_evidence_fails(self):
        result = gate.evaluate({}, NOW)
        self.assertEqual(result["decision"], "NO_GO")
        self.assertIn("national_collector:missing", result["failures"])

    def test_complete_contract(self):
        self.assertEqual(gate.evaluate(verified(), NOW)["decision"], "GO")

    def test_each_critical_evidence_is_independently_required(self):
        for key, field in (("national_collector", "three_scheduled_cycles_verified"),
                           ("national_collector", "all_nine_sources_checked"),
                           ("national_collector", "yakima_minutes_status"),
                           ("owned_host", "kaidance_300s_schedule_verified"),
                           ("private_site", "national_ui_evidence_binding_verified")):
            with self.subTest(key=key, field=field):
                obj = verified()
                del obj["gates"][key][field]
                self.assertEqual(gate.evaluate(obj, NOW)["decision"], "NO_GO")

    def test_old_status_and_missing_approval_fail(self):
        obj = verified()
        obj["gates"]["pnw_heartbeat"]["checked_at_utc"] = "2026-11-18T00:00:00Z"
        obj["founder_publication_approval"] = False
        failed = gate.evaluate(obj, NOW)
        self.assertEqual(failed["decision"], "NO_GO")
        self.assertIn("pnw_heartbeat:missing_or_stale_timestamp", failed["failures"])
        self.assertIn("founder_publication_approval:missing", failed["failures"])


if __name__ == "__main__":
    unittest.main()
