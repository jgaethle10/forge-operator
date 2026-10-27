#!/usr/bin/env python3
"""Offline controls for Bella's magnetic-presence audition."""
import importlib.util
import pathlib
import subprocess
import sys
import unittest

SOURCE=pathlib.Path(__file__).with_name("voice-bella-magnetic-presence.py")
spec=importlib.util.spec_from_file_location("bella_magnetic",SOURCE)
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class BellaMagneticTests(unittest.TestCase):
    def test_all_cells_unique_exact_spoken_words(self):
        lab.check()
        self.assertEqual(len(lab.BLIND),8)
        self.assertEqual(lab.tokens(lab.BASE),lab.tokens(lab.CONNECTED))
        self.assertEqual({m for _,_,m in lab.BLIND},{"neutral","nearfield"})

    def test_original_native_voice_and_no_unsafe_phonetic_modifications(self):
        text=SOURCE.read_text()
        self.assertEqual(lab.VOICE,"af_bella")
        self.assertEqual(lab.SPEEDS,{"native":1.0,"patient":.98})
        self.assertIn('voice=VOICE',text)
        self.assertNotIn("generate_from_tokens",text)
        self.assertNotIn("pitch=",text)
        self.assertNotIn("atempo=",text)

    def test_same_text_for_each_soundchain(self):
        for p in lab.PUNCTUATION:
            for s in lab.SPEEDS:
                pairs=[cell for cell in lab.BLIND if cell[:2]==(p,s)]
                self.assertEqual({cell[2] for cell in pairs},{"neutral","nearfield"})

    def test_blind_mobile_scorecard_no_condition_leak(self):
        page=lab.room()
        for label in ("connected","nearfield","patient","original"):
            # Names can appear in prose, but the actual assignment keys may not.
            self.assertNotIn('data-mix="'+label+'"',page)
        self.assertEqual(page.count('<audio controls'),8)
        for i in range(1,9):
            self.assertIn(f"take-{i:02d}.mp3",page)
        for axis in lab.AXES:
            self.assertIn(f'data-dimension="{axis}"',page)
        self.assertIn("productionApproved:false",page)
        self.assertIn("Local browser download",page)

    def test_light_preflight_without_downloaded_model(self):
        r=subprocess.run([sys.executable,str(SOURCE),"--verify-only"],
                         check=True,encoding="utf8",capture_output=True,timeout=10)
        self.assertIn("PASS",r.stdout)


if __name__ == "__main__":
    unittest.main()
