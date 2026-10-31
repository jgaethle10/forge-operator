#!/usr/bin/env python3
"""No-model regression tests for Bella's real-scene continuity experiment."""
import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest
import wave

SCRIPT = pathlib.Path(__file__).with_name("voice-bella-scene-continuity.py")
spec = importlib.util.spec_from_file_location("bella_scene_continuity", SCRIPT)
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class BellaSceneTests(unittest.TestCase):
    def test_one_canonical_script_no_word_changes(self):
        lab.verify()
        self.assertEqual(lab.words(lab.FULL), [w for scene in lab.SCENES for w in lab.words(scene)])
        self.assertEqual(len(lab.SCENES), 3)

    def test_control_vs_two_gap_lengths(self):
        self.assertEqual(set(lab.TAKES), {
            ("continuous", 0.0), ("segmented", 0.14), ("segmented", 0.26)
        })

    def test_no_edited_phonemes_pitch_or_fabricated_breaths(self):
        source = SCRIPT.read_text()
        self.assertEqual(lab.VOICE, "af_bella")
        self.assertEqual(lab.SPEED, 1.0)
        self.assertNotIn("generate_from_tokens", source)
        self.assertNotIn("atempo=", source)
        self.assertIn('"fabricatedBreaths":False', source)
        self.assertIn('"productionReady":False', source)

    def test_html_blind_review_contains_all_takes(self):
        page = lab.room()
        for index in range(1, 4):
            self.assertIn(f"take-{index:02d}.mp3", page)
        self.assertEqual(page.count("<audio controls"), 3)
        for name in lab.AXES:
            self.assertIn(f'data-score="{name}"', page)
        self.assertNotIn("0.14", page)
        self.assertNotIn("0.26", page)
        self.assertIn("publicationApproved:false", page)

    def test_real_pcm_short_source_versus_final_duration(self):
        with tempfile.TemporaryDirectory() as path:
            sound = pathlib.Path(path) / "source.wav"
            with wave.open(str(sound), "wb") as f:
                f.setframerate(lab.SR)
                f.setnchannels(1)
                f.setsampwidth(2)
                f.writeframes(bytes(2*lab.SR*4))
            self.assertEqual(lab.pcm_meta(sound, minimum=1), 4.0)
            with self.assertRaisesRegex(RuntimeError, "VOICE_DURATION_FAILED"):
                lab.pcm_meta(sound)
                
    def test_offline_preflight_executable(self):
        r = subprocess.run([sys.executable, str(SCRIPT), "--verify-only"],
                           capture_output=True, text=True, timeout=10, check=True)
        self.assertIn("PASS", r.stdout)


if __name__ == "__main__":
    unittest.main()
