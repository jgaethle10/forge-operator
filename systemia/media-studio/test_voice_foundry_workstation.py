#!/usr/bin/env python3
"""Model-free regression suite for owned multilingual Voice Foundry workstation."""
import importlib.util
import pathlib
import subprocess
import sys
import unittest

PATH=pathlib.Path(__file__).with_name("voice-foundry-workstation.py")
spec=importlib.util.spec_from_file_location("evercraft_voice_workstation",PATH)
studio=importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)


class WorkstationTests(unittest.TestCase):
    def test_lists_eight_stock_and_four_derived_voices(self):
        catalog=studio.catalog()
        self.assertEqual(len(catalog),12)
        self.assertNotIn("af_bella",catalog)
        self.assertEqual(catalog["ef_dora"]["language"],"es-ES")
        self.assertEqual(catalog["pm_alex"]["language"],"pt-BR")
        self.assertEqual(catalog["granite"]["kind"],"derivedTwoPackBlend")

    def test_arbitrary_spanish_copy_supported(self):
        text="Creamos herramientas con claridad, confianza y propósito. Construimos un futuro mejor para todos."
        cleaned,voice=studio.validate("ef_dora",text)
        self.assertEqual(cleaned,text)
        self.assertEqual(voice["language"],"es-ES")

    def test_reject_unknown_or_bella_profile(self):
        for voice in ("af_bella","famous_person","nonexistent",""):
            with self.assertRaisesRegex(ValueError,"UNKNOWN_OR_UNREVIEWED"):
                studio.validate(voice,"Every solution begins with understanding your needs.")

    def test_reject_phoneme_markup_control_chars_and_tiny_text(self):
        for text in ("[IPA] pronounce every sound", "<speak>hello</speak>",
                     "one", "Good\0morning everyone, there is something to say."):
            with self.assertRaises(ValueError):
                studio.validate("af_nicole",text)

    def test_arbitrary_valid_copy_spanish_portuguese_and_english(self):
        candidates={"en-US":"am_michael","en-GB":"bf_emma",
                    "es-ES":"em_alex","pt-BR":"pf_dora"}
        for lang,voice in candidates.items():
            text=studio.casting.SCRIPTS[lang]
            clean,selected=studio.validate(voice,text)
            self.assertEqual(selected["language"],lang)
            self.assertEqual(clean,text)

    def test_rights_and_release_flags_present(self):
        s=PATH.read_text()
        for k in ('"humanPronunciationApproved":False',
                  '"textRightsVerified":False',
                  '"commercialRightsIndependentlyVerified":False',
                  '"productionReady":False',
                  '"releaseAuthorized":False',
                  '"bellaOriginalMasterUntouched":True'):
            self.assertIn(k,s)

    def test_lists_voices_without_neural_runtime(self):
        output=subprocess.run([sys.executable,str(PATH),"--list-voices"],
                              check=True,text=True,capture_output=True,timeout=12)
        self.assertIn('"ef_dora"',output.stdout)
        self.assertIn('"brisa"',output.stdout)
        self.assertNotIn('"af_bella"',output.stdout)


if __name__=="__main__":
    unittest.main()
