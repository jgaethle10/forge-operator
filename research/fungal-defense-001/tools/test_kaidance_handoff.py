#!/usr/bin/env python3
"""Fail-closed tests for source-only Fungal Defense -> Kaidance handoff."""
import copy
import json
import unittest
from check_kaidance_handoff import ROOT,verify

class KaidanceHandoffTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((ROOT/"kaidance-research-handoff.v1.json").read_text("utf-8"))

    def test_valid_handoff_is_only_candidate(self):
        self.assertEqual(verify(self.data),[])
        self.assertEqual(self.data["authority"]["systemia_mission_admission"],"not_verified")
        self.assertIsNone(self.data["authority"]["authoritative_private_mission_id"])

    def test_no_second_scheduler(self):
        d=copy.deepcopy(self.data)
        d["authority"]["no_new_scheduler"]=False
        self.assertTrue(verify(d))

    def test_cannot_auto_promote_private_mission(self):
        d=copy.deepcopy(self.data)
        d["authority"]["systemia_mission_admission"]="admitted"
        d["authority"]["authoritative_private_mission_id"]="SENSITIVE_ID"
        self.assertTrue(verify(d))

    def test_no_unverified_progress_receipt(self):
        d=copy.deepcopy(self.data)
        d["existing_evidence"]["research_advanced_this_tick"]=True
        self.assertTrue(verify(d))

    def test_no_public_health_alerts(self):
        d=copy.deepcopy(self.data)
        d["authority"]["no_public_health_alerts"]=False
        self.assertTrue(verify(d))

    def test_no_silently_rerunning_source_refresh_every_tick(self):
        d=copy.deepcopy(self.data)
        d["cadence_policy"]["full_source_review_minimum_seconds"]=300
        self.assertTrue(verify(d))

    def test_unapproved_work_is_blocked(self):
        d=copy.deepcopy(self.data)
        d["bounded_next_action"]["authorized_to_execute"]=True
        self.assertTrue(verify(d))

    def test_deleted_source_reference_is_hold(self):
        d=copy.deepcopy(self.data)
        d["existing_evidence"]["dated_revised_annual_data"]="research/fungal-defense-001/data/not-here.json"
        self.assertTrue(verify(d))

    def test_wrong_continuity_issue_caught(self):
        d=copy.deepcopy(self.data)
        d["canonical_continuity_issue"]="https://github.com/jgaethle10/forge-operator/issues/9999"
        self.assertTrue(verify(d))

if __name__=="__main__":
    unittest.main()
