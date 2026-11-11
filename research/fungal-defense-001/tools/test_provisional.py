#!/usr/bin/env python3
"""Offline tests: provisional NNDSS category separation and source provenance."""
from __future__ import annotations
import copy
import json
from pathlib import Path
import unittest
from check_provisional import ROOT, validate

class ProvisionalIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.provisional=json.loads((ROOT/"data/cdc-nndss-provisional-2026-w43.json").read_text(encoding="utf-8"))
        cls.historical=json.loads((ROOT/"data/cdc-cauris-clinical-annual.json").read_text(encoding="utf-8"))
        cls.html=(ROOT/"observatory-v0.3.html").read_text(encoding="utf-8")

    def verify_rejected(self, provisional, historical=None, html=None):
        errors=validate(provisional, historical if historical is not None else self.historical,
                        html if html is not None else self.html)
        self.assertTrue(errors, "Unsafe source change was not detected")

    def test_reviewed_snapshot_passes(self):
        self.assertEqual(validate(self.provisional,self.historical,self.html), [])

    def test_invented_2026_total_fails(self):
        doc=copy.deepcopy(self.provisional)
        doc["clinical"]["snapshots"][-1]["cumulative_2026"]=999999
        self.verify_rejected(doc)

    def test_screening_is_not_clinical(self):
        doc=copy.deepcopy(self.provisional)
        doc["clinical"]["snapshots"][-1]["cumulative_2026"]=7202
        self.verify_rejected(doc)

    def test_untrusted_source_fails(self):
        doc=copy.deepcopy(self.provisional)
        doc["clinical"]["snapshots"][-1]["source_url"]="https://fakecdc.example/view/cdc/262786"
        self.verify_rejected(doc)

    def test_wrong_official_week_record_fails(self):
        doc=copy.deepcopy(self.provisional)
        doc["clinical"]["snapshots"][-1]["source_url"]="https://stacks.cdc.gov/view/cdc/262787"
        self.verify_rejected(doc)

    def test_wrong_week_ending_fails(self):
        doc=copy.deepcopy(self.provisional)
        doc["clinical"]["snapshots"][-1]["week_ending"]="2026-10-30"
        self.verify_rejected(doc)

    def test_auto_publication_fails(self):
        doc=copy.deepcopy(self.provisional)
        doc["publication_policy"]["no_automatic_case_updates"]=False
        self.verify_rejected(doc)

    def test_changed_source_not_equal_embedded_fails(self):
        doc=copy.deepcopy(self.provisional)
        doc["reviewed_at"]="2026-11-08"
        self.verify_rejected(doc)

    def test_wrong_historical_data_fails(self):
        hist=copy.deepcopy(self.historical)
        hist["datasets"][0]["values"][-1]["cases"]=999999
        self.verify_rejected(self.provisional,historical=hist)

    def test_missing_ui_separation_fails(self):
        self.verify_rejected(self.provisional,html=self.html.replace('id="provisionalType"','id="noSelect"'))

if __name__=="__main__":
    unittest.main()
