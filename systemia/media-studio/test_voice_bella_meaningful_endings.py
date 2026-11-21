#!/usr/bin/env python3
"""Offline unit tests for Bella meaningful-content endings, no model download."""
import importlib.util
import pathlib
import subprocess
import sys
import types
import unittest

PATH=pathlib.Path(__file__).with_name("voice-bella-meaningful-endings.py")
spec=importlib.util.spec_from_file_location("bella_meaningful_endings",PATH)
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class BellaSemanticEndingsTests(unittest.TestCase):
    def test_same_speech_prefix_and_native_voice(self):
        lab.preflight()
        self.assertEqual(lab.VOICE,"af_bella")
        self.assertEqual(lab.SEED,1701)
        self.assertEqual(lab.SR,24000)
        self.assertTrue(all(x.startswith(lab.PREFIX) for x in lab.COPIES.values()))

    def test_revisions_are_intentionally_different_words(self):
        self.assertNotEqual(lab.words(lab.ORIGINAL),lab.words(lab.REVISION))
        prefix=lab.words(lab.PREFIX)
        self.assertEqual(lab.words(lab.ORIGINAL)[:len(prefix)],prefix)
        self.assertEqual(lab.words(lab.REVISION)[:len(prefix)],prefix)

    def test_original_has_dangling_function_word_ending(self):
        self.assertEqual(lab.words(lab.ORIGINAL)[-1],"to")
        self.assertTrue(lab.ORIGINAL.endswith("come back to."))
        self.assertIn("attention to. Something",lab.ORIGINAL)

    def test_new_script_ends_on_meaningful_content_word(self):
        self.assertTrue(lab.REVISION.endswith("revisit."))
        self.assertIn("worth your attention. Something",lab.REVISION)
        self.assertNotIn("attention to.",lab.REVISION)

    def test_review_does_not_claim_same_word_comparison_or_production(self):
        page=lab.review_page()
        self.assertIn("not a same-words test",page)
        self.assertIn("publicationApproved:false",page)
        self.assertIn("Take A",page)
        self.assertIn("Take B",page)
        self.assertEqual(page.count("<audio preload="),2)

    def test_no_phoneme_overrides_or_audio_retiming(self):
        src=PATH.read_text()
        self.assertIn("voice=VOICE,speed=1.0",src)
        self.assertNotIn("generate_from_tokens(",src)
        self.assertNotIn("atempo=",src)
        self.assertIn('"phonemeOverridesApplied":False',src)
        self.assertIn('"timeStretchingApplied":False',src)
        self.assertIn('"productionApproved":False',src)

    def test_offline_cli_preflight(self):
        r=subprocess.run([sys.executable,str(PATH),"--verify-only"],
                         check=True,capture_output=True,text=True,timeout=10)
        self.assertIn("PASS",r.stdout)


if __name__=="__main__":
    unittest.main()
