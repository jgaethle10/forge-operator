#!/usr/bin/env python3
"""No-neural, actual-PCM regression tests for Bella phone-audition exporter."""
import hashlib
import importlib.util
import json
import pathlib
import shutil
import tempfile
import unittest
import wave

SCRIPT = pathlib.Path(__file__).with_name("voice-bella-mobile-export.py")
spec = importlib.util.spec_from_file_location("bella_mobile_export", SCRIPT)
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


def make_source(root):
    contexts = {}
    for context in ("brand", "story"):
        directory = root / context
        directory.mkdir()
        records = []
        for i in range(1, 5):
            path = directory / f"take-{i:02d}.wav"
            with wave.open(str(path), "wb") as f:
                f.setnchannels(1)
                f.setsampwidth(2)
                f.setframerate(24000)
                f.writeframes((int(500+i).to_bytes(2, "little", signed=True)) * (24000*11))
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            records.append({"blindTake": i, "factorialCell": f"cell_{i}",
                            "wav": path.name, "wavSha256": digest,
                            "audioMetrics": {"durationSec": 11}})
        contexts[context] = records
    record = {"schema": "evercraft.voice-foundry.bella-factorial-study.v1",
              "voiceId": "af_bella", "kokoroVersion": "0.9.4",
              "nativeVoiceUnchanged": True, "publishReady": False,
              "founderListeningApproved": False,
              "cloning": False, "phonemeOverrides": False, "contexts": contexts}
    (root / "evidence.json").write_text(json.dumps(record))
    return record


class BellaMobileExportTests(unittest.TestCase):
    def test_verified_sources_are_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            make_source(root)
            checked = exporter.check(root)
            self.assertEqual(len(checked["brand"]), 4)
            self.assertEqual(len(checked["story"]), 4)

    def test_any_changed_audio_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            make_source(root)
            with open(root / "story" / "take-03.wav", "ab") as f:
                f.write(b"tampered")
            with self.assertRaisesRegex(RuntimeError, "HASH_FAILED"):
                exporter.check(root)

    def test_do_not_export_if_human_approval_falsely_claimed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            record = make_source(root)
            record["founderListeningApproved"] = True
            (root / "evidence.json").write_text(json.dumps(record))
            with self.assertRaisesRegex(RuntimeError, "APPROVAL_INVALID"):
                exporter.check(root)

    def test_reject_duplicate_factorial_cells(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            record = make_source(root)
            record["contexts"]["brand"][0]["factorialCell"] = record["contexts"]["brand"][1]["factorialCell"]
            (root / "evidence.json").write_text(json.dumps(record))
            with self.assertRaisesRegex(RuntimeError, "DUPLICATE_CONDITIONS"):
                exporter.check(root)

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
    def test_real_pcm_to_mp3_full_reel_offsets_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp) / "source"
            root.mkdir()
            make_source(root)
            output = pathlib.Path(tmp) / "review"
            exporter.build(root, output)
            manifest = json.loads((output / "evidence.json").read_text())
            self.assertEqual(set(manifest["reels"]), {"brand", "story"})
            for context in ("brand", "story"):
                reel = manifest["reels"][context]
                self.assertAlmostEqual(reel["durationSec"], 48.5)
                self.assertEqual([x["startSec"] for x in reel["takes"]], [0, 12.5, 25, 37.5])
                mp3 = output / reel["file"]
                self.assertGreater(mp3.stat().st_size, 5000)
                self.assertEqual(hashlib.sha256(mp3.read_bytes()).hexdigest(), reel["sha256"])
            with self.assertRaisesRegex(RuntimeError, "OUTPUT_ALREADY_EXISTS"):
                exporter.build(root, output)


if __name__ == "__main__":
    unittest.main()
