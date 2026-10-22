"""Tests for Evercraft-authored canonical-shaped frame sequence ingest. Fixtures are not live World Engine footage."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from render import GEOMETRIES, encode_external_sequence, fixture_frame


class ExternalSequenceTests(unittest.TestCase):
    def write_fixture(self, root, count=3):
        root = Path(root)
        paths = []
        for index in range(count):
            frame = fixture_frame(index / 30)
            relative = f"frames/frame-{index:03d}.json"
            location = root / relative
            location.parent.mkdir(parents=True, exist_ok=True)
            location.write_text(json.dumps(frame))
            paths.append(relative)
        (root / "geometry.json").write_text(json.dumps(GEOMETRIES))
        manifest = {
            "schema": "evercraft.photon-forge-v4.frame-sequence.v1",
            "fps": 30,
            "framePaths": paths,
        }
        (root / "sequence.json").write_text(json.dumps(manifest))
        return manifest

    def test_owned_renderer_encodes_supplied_frames_with_real_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_fixture(root)
            output = root / "film.mp4"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("render.py")),
                    "--sequence-manifest", str(root / "sequence.json"),
                    "--geometry-json", str(root / "geometry.json"),
                    "--output", str(output),
                    "--fps", "30",
                ],
                capture_output=True, text=True, check=True,
            )
            receipt = json.loads(completed.stdout)
            self.assertTrue(output.exists())
            self.assertGreater(output.stat().st_size, 1000)
            self.assertEqual(receipt["frameCount"], 3)
            self.assertEqual(receipt["worldId"], "photon-forge-v4-fixture")
            self.assertEqual(receipt["renderedBy"], "Evercraft Photon Forge V4 CPU triangle renderer")
            self.assertEqual(receipt["outputSha256"], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(len(receipt["frameSourceSha256"]), 3)
            self.assertEqual(len(receipt["sampleFrames"]), 3)
            self.assertEqual(json.loads((root / "film.receipt.json").read_text()), receipt)
            self.assertFalse(receipt["worldEngineRuntimeExecuted"])
            self.assertTrue(receipt["originRuntimeUnverified"])
            self.assertFalse(receipt["webgpuHardwareVerified"])
            self.assertFalse(receipt["masterQcApproved"])
            self.assertFalse(receipt["publicationAuthority"])

    def test_path_traversal_and_duplicate_frames_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.write_fixture(root)
            manifest["framePaths"][1] = "../outside.json"
            (root / "sequence.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "sequence_path_unsafe"):
                encode_external_sequence(root / "sequence.json", root / "geometry.json", root / "out.mp4", 30)
            manifest["framePaths"][1] = manifest["framePaths"][0]
            (root / "sequence.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "sequence_paths_invalid"):
                encode_external_sequence(root / "sequence.json", root / "geometry.json", root / "out.mp4", 30)

    def test_tampered_frame_digest_and_incorrect_timing_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.write_fixture(root)
            second = root / manifest["framePaths"][1]
            frame = json.loads(second.read_text())
            frame["camera"]["near"] = 0.99
            second.write_text(json.dumps(frame))
            with self.assertRaisesRegex(ValueError, "digest_mismatch"):
                encode_external_sequence(root / "sequence.json", root / "geometry.json", root / "out.mp4", 30)
            self.write_fixture(root)
            frame = json.loads(second.read_text())
            frame["timeSec"] = 99.0
            from worldframe import sha
            frame["digest"] = sha({k: v for k, v in frame.items() if k != "digest"})
            second.write_text(json.dumps(frame))
            with self.assertRaisesRegex(ValueError, "sequence_frame_time_mismatch"):
                encode_external_sequence(root / "sequence.json", root / "geometry.json", root / "out.mp4", 30)

    def test_sequence_cannot_claim_wrong_fps(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_fixture(root)
            with self.assertRaisesRegex(ValueError, "sequence_fps_mismatch"):
                encode_external_sequence(root / "sequence.json", root / "geometry.json", root / "out.mp4", 24)


if __name__ == "__main__":
    unittest.main()
