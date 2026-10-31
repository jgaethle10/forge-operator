#!/usr/bin/env python3
"""Offline factorial-design and blind-review tests, no Kokoro model needed."""
import importlib.util
import pathlib
import subprocess
import sys
import unittest

FILENAME = pathlib.Path(__file__).with_name("voice-bella-factorial-study.py")
spec = importlib.util.spec_from_file_location("bella_factorial", FILENAME)
study = importlib.util.module_from_spec(spec)
spec.loader.exec_module(study)


class BellaFactorialTests(unittest.TestCase):
    def test_native_factorial_design_is_crossed(self):
        study.verify()
        self.assertEqual(set(study.FACTORIAL.values()), {
            ("plain", 1.0), ("plain", .99), ("connected", 1.0), ("connected", .99),
        })
        self.assertEqual(len(study.REVIEW_ORDER), 4)

    def test_exact_words_retained_each_context(self):
        for context in study.CONTEXTS.values():
            self.assertEqual(study.lab.words(context["plain"]), study.lab.words(context["connected"]))
            self.assertNotEqual(context["plain"], context["connected"])

    def test_identical_native_seed_per_context(self):
        self.assertEqual(study.SEEDS, {"brand": 1701, "story": 1702})
        self.assertEqual(study.lab.VOICE_ID, "af_bella")

    def test_contexts_are_distinct(self):
        brand = study.lab.words(study.CONTEXTS["brand"]["plain"])
        story = study.lab.words(study.CONTEXTS["story"]["plain"])
        self.assertNotEqual(brand, story)

    def test_review_page_hides_factor_labels_and_has_validated_score_export(self):
        for context in study.CONTEXTS:
            page = study.room_html(context)
            for name in study.FACTORIAL:
                self.assertNotIn(name, page)
            for key in ("human_rhythm", "emotional_credibility", "same_bella_identity"):
                self.assertIn(key, page)
            for i in range(1, 5):
                self.assertIn(f"take-{i:02d}.wav", page)
            self.assertIn("Export private listening scores", page)
            self.assertIn("noHumanApprovalGranted:true", page)
            self.assertIn("No network submission", page)

    def test_preflight_only_no_deps(self):
        p = subprocess.run(
            [sys.executable, str(FILENAME), "--verify-only"],
            capture_output=True, text=True, check=True,
        )
        self.assertIn("PASS", p.stdout)


if __name__ == "__main__":
    unittest.main()
