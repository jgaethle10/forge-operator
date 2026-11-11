"""No external packages or model weights required for input/evidence contract tests."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace

MODULE = Path(__file__).with_name("offline_stereo.py")
spec = importlib.util.spec_from_file_location("spatial_offline_stereo", MODULE)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class OfflineStereoContractTests(unittest.TestCase):
    def test_nms_keeps_different_classes_and_suppresses_duplicates(self):
        rows = [
            (0, .9, (10, 10, 30, 30)),
            (0, .8, (11, 10, 31, 30)),
            (1, .7, (11, 10, 31, 30)),
        ]
        result = runner.nms(rows)
        self.assertEqual(len(result), 2)
        self.assertEqual([r[0] for r in result], [0, 1])

    def test_model_manifest_requires_verified_local_rights(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root, "manifest.json")
            valid = {
                "format": "yolov8_onnx_no_nms",
                "inputSize": 640,
                "labels": ["car", "truck"],
                "sha256": "f" * 64,
                "rights": "authorized_local_use",
            }
            p.write_text(json.dumps(valid))
            self.assertEqual(runner.load_manifest(p)["labels"], ["car", "truck"])
            for key, bad in [
                ("rights", "unconfirmed"),
                ("format", "fused_yolo"),
                ("inputSize", 641),
                ("labels", ["car", "car"]),
                ("sha256", "bad"),
            ]:
                modified = {**valid, key: bad}
                p.write_text(json.dumps(modified))
                with self.subTest(key=key), self.assertRaises(ValueError):
                    runner.load_manifest(p)

    def test_observation_is_camera_relative_and_preserves_unknown_depth(self):
        base = ("f0", 123, 0, "car", .9, (10, 20, 30, 18))
        unknown = runner.observation(*base, None, 120, .12, "a" * 64, 160, 100)
        self.assertIsNone(unknown["cameraPositionM"])
        self.assertIsNone(unknown["depthEstimateM"])
        self.assertFalse(unknown["georegistered"])
        self.assertFalse(unknown["safetyCriticalApproved"])
        valid = runner.observation(*base, 4.0, 120, .12, "a" * 64, 160, 100)
        self.assertEqual(valid["depthEstimateM"], 3.6)
        self.assertEqual(valid["cameraPositionM"]["z"], 3.6)
        self.assertEqual(valid["frameId"], "f0")
        self.assertEqual(valid["schema"], "evercraft.spatial-perception.observation.v0")

    def test_bad_confidence_and_invalid_box_rejected(self):
        args = ("f0", 0, 0, "car")
        with self.assertRaisesRegex(ValueError, "invalid_detector_confidence"):
            runner.observation(*args, float("nan"), (10, 20, 20, 20), None, 120, .12, "a"*64, 160, 100)
        with self.assertRaisesRegex(ValueError, "invalid_detection_box"):
            runner.observation(*args, .9, (-1, 0, 20, 20), None, 120, .12, "a"*64, 160, 100)

    def test_missing_rights_fail_before_importing_any_ml_runtime(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            for file in ("video.mp4", "model.onnx", "manifest.json"):
                (root / file).write_bytes(b"fixture")
            opts = SimpleNamespace(
                video=root/"video.mp4", model=root/"model.onnx",
                manifest=root/"manifest.json", output=root/"out.json",
                authorized_source=False, rectified_stereo=True,
                fx_px=120.0, baseline_m=.12, confidence=.5,
                max_frames=5, frame_step=1
            )
            with self.assertRaisesRegex(ValueError, "source_authorization_and_rectification_required"):
                runner.run(opts)
            opts.authorized_source = True
            opts.rectified_stereo = False
            with self.assertRaisesRegex(ValueError, "source_authorization_and_rectification_required"):
                runner.run(opts)
            opts.rectified_stereo = True
            opts.output = opts.video
            with self.assertRaisesRegex(ValueError, "output_would_overwrite_input"):
                runner.run(opts)

    def test_json_file_is_private_and_replaces_atomically(self):
        with tempfile.TemporaryDirectory() as root:
            output = Path(root, "capture.json")
            runner.write_private_json(output, {"frames": [], "private": True})
            self.assertEqual(json.loads(output.read_text())["frames"], [])
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            runner.write_private_json(output, {"frames": [{"frameId": "f0"}]})
            self.assertEqual(json.loads(output.read_text())["frames"][0]["frameId"], "f0")
            self.assertEqual([p for p in Path(root).iterdir() if p.suffix == ".tmp"], [])

    def test_sha256_covers_entire_local_source(self):
        with tempfile.TemporaryDirectory() as root:
            f = Path(root, "sample.bin")
            f.write_bytes(b"the entire frame source")
            self.assertEqual(len(runner.sha256_file(f)), 64)
            f.write_bytes(b"the entire frame sourcE")
            self.assertNotEqual(runner.sha256_file(f), runner.sha256_file(MODULE))


if __name__ == "__main__":
    unittest.main()
