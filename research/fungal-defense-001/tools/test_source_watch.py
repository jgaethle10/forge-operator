#!/usr/bin/env python3
"""Offline CDC source drift tests; no live network and no patient data."""
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from source_watch import parse_headline, probe

HTML_MATCH = b'''<!doctype html><html><body><h1>Tracking C. auris</h1><p>A total of 6,304 clinical cases of <b>Candida auris</b> (C. auris) were reported to CDC in 2024.</p></body></html>'''
HTML_DRIFT = b'''<!doctype html><html><body><p>A total of 7,100 clinical cases of Candida auris (C. auris) were reported to CDC in 2025.</p></body></html>'''
STAMP = "2026-11-04T00:00:00+00:00"

class SourceDriftTests(unittest.TestCase):
    def test_match(self):
        r = probe(HTML_MATCH, "fixture", STAMP)
        self.assertEqual(r["status"], "match")
        self.assertEqual(r["headline_observed"], {"year": 2024, "clinical_cases": 6304})
        self.assertFalse(r["may_auto_publish"])
        self.assertFalse(r["is_outbreak_alert"])

    def test_drift_is_not_an_outbreak_alert(self):
        r = probe(HTML_DRIFT, "fixture", STAMP)
        self.assertEqual(r["status"], "source_drift")
        self.assertFalse(r["may_auto_publish"])
        self.assertFalse(r["is_outbreak_alert"])

    def test_script_injection_cannot_forge_headline(self):
        bogus = b'<html><script>A total of 6,304 clinical cases of Candida auris were reported to CDC in 2024.</script></html>'
        self.assertIsNone(parse_headline(bogus))

    def test_unrecognized_page_fails_closed(self):
        r = probe(b'<html>no scientific figures here</html>', "fixture", STAMP)
        self.assertEqual(r["status"], "unverified")
        self.assertIsNone(r["headline_observed"])

    def test_whitespace_and_html_nodes(self):
        altered = HTML_MATCH.replace(b' of <b>', b'\n of \n <b>')
        self.assertEqual(parse_headline(altered), (2024, 6304))

if __name__ == '__main__':
    unittest.main()
