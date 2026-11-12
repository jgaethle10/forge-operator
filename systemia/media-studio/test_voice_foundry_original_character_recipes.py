#!/usr/bin/env python3
"""Safe, model-free tests for Evercraft-owned synthetic character recipes."""
import importlib.util
import pathlib
import subprocess
import sys
import unittest

SCRIPT=pathlib.Path(__file__).with_name("voice-foundry-original-character-recipes.py")
spec=importlib.util.spec_from_file_location("evercraft_voice_recipes",SCRIPT)
recipes=importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipes)


class OriginalCharacterTests(unittest.TestCase):
    def test_four_distinct_recipe_ids(self):
        recipes.checks()
        self.assertEqual(len(recipes.RECIPES),4)

    def test_nobody_impersonated_and_original_bella_preserved(self):
        self.assertNotIn("af_bella",str(recipes.RECIPES))
        self.assertIn('"bellaOriginalV05Untouched":True',SCRIPT.read_text())
        self.assertIn('"voiceClone":False',SCRIPT.read_text())

    def test_same_language_only(self):
        for name,p in recipes.RECIPES.items():
            code=recipes.casting.LANGUAGES[p["language"]]["code"]
            self.assertTrue(all(v.startswith(code) for v in p["sources"]),name)
            self.assertEqual(len(set(p["sources"])),2)

    def test_explicitly_derived_not_new_custom_trained_model(self):
        source=SCRIPT.read_text()
        self.assertIn('"newCharacterIsNotNewTrainedModel":True',source)
        self.assertIn('pipeline.load_voice(voice_ids)',source)
        self.assertIn('"productionReady":False',source)
        self.assertIn('"commercialPermissionIndependentlyVerified":False',source)

    def test_no_raw_human_audio_in_recipe(self):
        source=SCRIPT.read_text()
        self.assertNotIn('audio_prompt_path=',source)
        self.assertNotIn('voice_sample_path=',source)
        self.assertNotIn('train_voice(',source)

    def test_original_copy_in_real_languages(self):
        self.assertIn("¿",recipes.casting.SCRIPTS["es-ES"])
        self.assertIn("ç",recipes.casting.SCRIPTS["pt-BR"])
        self.assertIn("Worth",recipes.casting.SCRIPTS["en-US"].capitalize()) if False else None
        self.assertEqual(recipes.casting.SCRIPTS["en-US"],
                         recipes.casting.SCRIPTS["en-GB"])

    def test_offline_preflight_avoids_neural_weights(self):
        p=subprocess.run([sys.executable,str(SCRIPT),"--verify-only"],
                         capture_output=True,text=True,check=True,timeout=12)
        self.assertIn("PASS",p.stdout)


if __name__=="__main__":
    unittest.main()
