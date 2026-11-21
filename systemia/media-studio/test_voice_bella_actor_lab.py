#!/usr/bin/env python3
"""Offline regression tests for Bella's native performance audition boundary."""
import array
import importlib.util
import math
import pathlib
import subprocess
import sys
import tempfile
import unittest
import wave

SCRIPT = pathlib.Path(__file__).with_name("voice-bella-actor-lab.py")
spec = importlib.util.spec_from_file_location("bella_actor_lab", SCRIPT)
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class BellaActorLabTests(unittest.TestCase):
    def test_verified_scripts_preserve_every_spoken_word(self):
        lab.verify()
        tokens = lab.words(lab.CANONICAL)
        self.assertGreater(len(tokens), 40)
        for variant in lab.TAKES.values():
            self.assertEqual(tokens, lab.words(variant["text"]))

    def test_changing_even_one_word_fails_fidelity(self):
        wrong = lab.CANONICAL.replace("whole team", "group").replace("next step", "wrong step")
        self.assertNotEqual(lab.words(wrong), lab.words(lab.CANONICAL))

    def test_original_voice_and_modest_native_speeds(self):
        self.assertEqual(lab.VOICE_ID, "af_bella")
        self.assertEqual(lab.MODEL_VERSION, "0.9.4")
        self.assertEqual(len(lab.BLIND_ORDER), 3)
        self.assertEqual(set(lab.BLIND_ORDER), set(lab.TAKES))
        self.assertTrue(all(.97 <= s["speed"] <= 1.03 for s in lab.TAKES.values()))

    def test_review_page_hides_variant_names(self):
        page = lab.listening_room()
        for variant in lab.TAKES:
            self.assertNotIn(variant, page)
        for n in range(1, 4):
            self.assertIn(f"take-{n:02d}.wav", page)
        self.assertIn("REVIEW ONLY", page)

    def test_verify_only_needs_no_neural_dependencies_or_model(self):
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), "--verify-only"],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        )
        self.assertIn("PASS", proc.stdout)

    @staticmethod
    def _write_audio(path, speech=True, stereo=False):
        rate = lab.SAMPLE_RATE
        frames = array.array("h")
        # 0.2s silence / 5s tone / 0.6s mid-pause / 4.9s tone / 0.3s tail.
        spans = [(.2, False), (5, speech), (.6, False), (4.9, speech), (.3, False)]
        for seconds, sound in spans:
            count = round(seconds * rate)
            if sound:
                frames.extend(int(4500 * math.sin(i * 2 * math.pi * 240 / rate)) for i in range(count))
            else:
                frames.extend([0] * count)
        if sys.byteorder == "big":
            frames.byteswap()
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(2 if stereo else 1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(frames.tobytes())

    def test_real_wav_metrics_detect_long_pause(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "fixture.wav"
            self._write_audio(path)
            analysis = lab.inspect_wav(path)
            self.assertAlmostEqual(analysis["durationSec"], 11.0, places=1)
            self.assertGreaterEqual(analysis["longestInternalPauseSec"], .55)
            self.assertGreater(analysis["leadingSilenceSec"], .15)

    def test_silence_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "silent.wav"
            self._write_audio(path, speech=False)
            with self.assertRaisesRegex(RuntimeError, "AUDIO_QUALITY_GATE"):
                lab.inspect_wav(path)

    def test_stereo_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "stereo.wav"
            self._write_audio(path, stereo=True)
            with self.assertRaisesRegex(RuntimeError, "INVALID_PCM"):
                lab.inspect_wav(path)


if __name__ == "__main__":
    unittest.main()
