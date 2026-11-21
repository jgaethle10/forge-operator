#!/usr/bin/env python3
"""Offline regression tests for 2026-11-13 CDC annual revision and claim age."""
import copy
import json
import unittest
from check_annual_revision import ROOT, validate


class AnnualRevisionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.current=json.loads((ROOT / "data/cdc-cauris-annual-2026-11-13.json").read_text("utf-8"))
        cls.archive=json.loads((ROOT / "data/cdc-cauris-clinical-annual.json").read_text("utf-8"))
        cls.provisional=json.loads((ROOT / "data/cdc-nndss-provisional-2026-w43.json").read_text("utf-8"))
        cls.html=(ROOT / "observatory-v0.4.html").read_text("utf-8")

    def test_reviewed_snapshot_passes(self):
        self.assertEqual(validate(self.current,self.archive,self.provisional,self.html),[])

    def test_fake_new_2025_total_rejected(self):
        changed=copy.deepcopy(self.current)
        changed["yearly_clinical_cases"][-1]=10000
        self.assertTrue(validate(changed,self.archive,self.provisional,self.html))

    def test_2024_revision_must_match_snapshot(self):
        changed=copy.deepcopy(self.current)
        changed["revised_2024"]=6304
        self.assertTrue(validate(changed,self.archive,self.provisional,self.html))

    def test_cannot_silently_overwrite_archived_counts(self):
        old=copy.deepcopy(self.archive)
        old["datasets"][0]["values"][-1]["cases"]=6370
        self.assertTrue(validate(self.current,old,self.provisional,self.html))

    def test_no_external_hospital_blog_as_primary(self):
        changed=copy.deepcopy(self.current)
        changed["source_url"]="https://viral-hospital-news.example/fungus"
        self.assertTrue(validate(changed,self.archive,self.provisional,self.html))

    def test_cannot_present_new_2025_cases_as_live(self):
        changed=copy.deepcopy(self.current)
        changed["is_live"]=True
        self.assertTrue(validate(changed,self.archive,self.provisional,self.html))

    def test_cannot_remove_fear_mongering_fact_check(self):
        changed=copy.deepcopy(self.current)
        changed["context"][0]["status"]="true"
        self.assertTrue(validate(changed,self.archive,self.provisional,self.html))

    def test_publication_guardrails_present(self):
        changed=copy.deepcopy(self.current)
        changed["reporting_policy"]["no_auto_publish"]=False
        self.assertTrue(validate(changed,self.archive,self.provisional,self.html))

    def test_provisional_2026_not_substituted(self):
        changed=copy.deepcopy(self.provisional)
        changed["is_live"]=True
        self.assertTrue(validate(self.current,self.archive,changed,self.html))

    def test_html_revision_must_match_canonical(self):
        self.assertTrue(validate(self.current,self.archive,self.provisional,
                                 self.html.replace("8,780", "88,780",1)))

    def test_mandatory_original_discovery_timeline(self):
        self.assertTrue(validate(self.current,self.archive,self.provisional,
                                 self.html.replace("November 2016","November 2026",1)))

if __name__=="__main__":
    unittest.main()
