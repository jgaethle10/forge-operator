#!/usr/bin/env python3
"""No-model safety and language-routing regression tests for Voice Foundry."""
import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest
import wave

PATH=pathlib.Path(__file__).with_name("voice-foundry-multilingual-casting.py")
spec=importlib.util.spec_from_file_location("evercraft_voice_cast",PATH)
cast=importlib.util.module_from_spec(spec)
spec.loader.exec_module(cast)


class VoiceFoundryCastingTests(unittest.TestCase):
    def test_all_eight_cast_members_are_real_named_packs(self):
        cast.preflight()
        self.assertEqual(len(cast.CAST),8)
        self.assertEqual(len({x["voice"] for x in cast.CAST.values()}),8)
        self.assertNotIn("af_bella",{x["voice"] for x in cast.CAST.values()})

    def test_language_frontends_are_not_faked(self):
        self.assertEqual(cast.LANGUAGES["es-ES"]["code"],"e")
        self.assertEqual(cast.LANGUAGES["pt-BR"]["code"],"p")
        self.assertEqual(cast.LANGUAGES["en-GB"]["code"],"b")
        for entry in cast.CAST.values():
            self.assertEqual(entry["voice"][0],cast.LANGUAGES[entry["lang"]]["code"])

    def test_spanish_and_portuguese_are_not_english_text(self):
        self.assertIn("¿Qué",cast.SCRIPTS["es-ES"])
        self.assertIn("confiable",cast.SCRIPTS["es-ES"])
        self.assertIn("começa",cast.SCRIPTS["pt-BR"])
        self.assertIn("confiável",cast.SCRIPTS["pt-BR"])
        self.assertNotEqual(cast.SCRIPTS["en-US"],cast.SCRIPTS["es-ES"])
        self.assertNotEqual(cast.SCRIPTS["es-ES"],cast.SCRIPTS["pt-BR"])

    def test_meaningful_conclusions_no_dangling_function_words(self):
        self.assertTrue(cast.SCRIPTS["en-US"].endswith("creating."))
        self.assertTrue(cast.SCRIPTS["es-ES"].endswith("confianza."))
        self.assertTrue(cast.SCRIPTS["pt-BR"].endswith("confiança."))

    def test_no_unapproved_model_voice_claims(self):
        page=cast.make_page()
        self.assertEqual(page.count("<audio controls"),8)
        self.assertIn("not bespoke", " ".join(page.replace("**","").split()))
        self.assertNotIn("af_bella",page)
        source=PATH.read_text()
        for gate in ('"productionReady":False','"humanListeningApproved":False',
                     '"publicReleaseAuthorized":False','"allVoiceIdentitiesAlreadyPresentInModel":True',
                     '"trainedCustomVoice":False'):
            self.assertIn(gate,source)

    def test_real_wave_spec_validator_with_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            file=pathlib.Path(tmp)/"fake.wav"
            with wave.open(str(file),"wb") as f:
                f.setnchannels(1)
                f.setsampwidth(2)
                f.setframerate(24000)
                f.writeframes(bytes(2*24000*9))
            self.assertEqual(cast.validate_wav(file),9.0)

    def test_bad_channel_count_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            file=pathlib.Path(tmp)/"fake_stereo.wav"
            with wave.open(str(file),"wb") as f:
                f.setnchannels(2)
                f.setsampwidth(2)
                f.setframerate(24000)
                f.writeframes(bytes(4*24000*9))
            with self.assertRaisesRegex(RuntimeError,"PCM_EXPECTED"):
                cast.validate_wav(file)

    def test_preflight_does_not_download_models(self):
        r=subprocess.run([sys.executable,str(PATH),"--verify-only"],
                         check=True,capture_output=True,text=True,timeout=12)
        self.assertIn("PASS",r.stdout)


if __name__=="__main__":
    unittest.main()
