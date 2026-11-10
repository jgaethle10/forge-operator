"""End-to-end synthetic fixture for the *real* offline stereo importer.

Requires numpy, opencv-python-headless, onnx, onnxruntime locally in CI.
Creates a deliberately artificial, constant-output ONNX graph and procedural
stereo frames. No model weights, real footage, or network inference are used.

Passing is evidence of pipeline wiring, NOT object detection quality,
calibration, forensic validity, or road-scene reconstruction.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import cv2
import numpy as np
import onnx
from onnx import TensorProto, helper


RUNNER = Path(__file__).with_name("offline_stereo.py")


def synthetic_model(destination: Path):
    """Unfused YOLOv8-compatible single constant proposal, not trained AI."""
    input_spec = helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, 160, 160])
    output_spec = helper.make_tensor_value_info("predictions", TensorProto.FLOAT, [1, 5, 1])
    # Letterboxed 256x128 left view at scale 0.625, 40px vertical padding.
    # Center box maps back to x~77..179, y~26..102.
    prediction = [80.0, 80.0, 64.0, 48.0, 0.97]
    tensor = helper.make_tensor("tensor_value", TensorProto.FLOAT, [1, 5, 1], prediction)
    node = helper.make_node("Constant", [], ["predictions"], value=tensor)
    graph = helper.make_graph([node], "evercraft_synthetic_constant_detector",
                              [input_spec], [output_spec])
    model = helper.make_model(graph, opset_imports=[helper.make_operatorsetid("", 13)])
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, destination)


def synthetic_stereo_video(destination: Path, *, blank=False):
    """Synchronized rectified side-by-side BGR frames with known 8px disparity."""
    width, height, disparity = 256, 128, 8
    writer = cv2.VideoWriter(str(destination), cv2.VideoWriter_fourcc(*"MJPG"),
                             5.0, (width * 2, height))
    if not writer.isOpened():
        raise RuntimeError("synthetic_video_writer_unavailable")
    try:
        for frame_index in range(4):
            if blank:
                left = np.full((height, width), 100, dtype=np.uint8)
            else:
                rng = np.random.default_rng(1000 + frame_index)
                left = rng.integers(20, 235, size=(height, width), dtype=np.uint8)
            right = np.zeros_like(left)
            right[:, :width-disparity] = left[:, disparity:]
            stereo = np.concatenate([left, right], axis=1)
            bgr = cv2.cvtColor(stereo, cv2.COLOR_GRAY2BGR)
            writer.write(bgr)
    finally:
        writer.release()
    if not destination.is_file() or destination.stat().st_size < 200:
        raise RuntimeError("synthetic_video_not_written")


def args(root: Path, video: Path, model: Path, manifest: Path, output: Path):
    return [
        sys.executable, str(RUNNER),
        "--video", str(video), "--model", str(model), "--manifest", str(manifest),
        "--fx-px", "240", "--baseline-m", "0.12",
        "--frame-step", "1", "--max-frames", "4",
        "--authorized-source", "--rectified-stereo", "--output", str(output)
    ]


class SyntheticEndToEnd(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="evercraft-spatial-e2e-")
        root = Path(self.folder.name)
        self.video = root/"synthetic-rectified.avi"
        self.model = root/"constant-output.onnx"
        self.manifest = root/"approved-synthetic-manifest.json"
        self.output = root/"derived-observations.json"
        synthetic_model(self.model)
        synthetic_stereo_video(self.video)
        manifest = {
            "format": "yolov8_onnx_no_nms",
            "inputSize": 160,
            "labels": ["synthetic_proposal"],
            "sha256": hashlib.sha256(self.model.read_bytes()).hexdigest(),
            "rights": "authorized_local_use"
        }
        self.manifest.write_text(json.dumps(manifest), encoding="utf-8")
        self.command = args(root, self.video, self.model, self.manifest, self.output)

    def tearDown(self):
        self.folder.cleanup()

    def test_complete_video_onnx_stereo_and_json_output(self):
        finished = subprocess.run(self.command, text=True, capture_output=True,
                                  timeout=50, check=False)
        self.assertEqual(finished.returncode, 0, finished.stderr)
        report = json.loads(finished.stdout)
        self.assertEqual(report["frames"], 4)
        self.assertEqual(report["observations"], 4)
        self.assertEqual(report["evidenceStatus"], "unreviewed_not_field_calibrated")
        payload = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual(payload["schema"], "evercraft.spatial-perception.offline-import.v1")
        self.assertEqual(payload["sourceSha256"], hashlib.sha256(self.video.read_bytes()).hexdigest())
        self.assertEqual(payload["modelSha256"], hashlib.sha256(self.model.read_bytes()).hexdigest())
        self.assertEqual(payload["coordinateFrame"], "camera_relative")
        self.assertEqual([f["timestampMs"] for f in payload["frames"]], [0, 200, 400, 600])
        self.assertEqual(len(payload["frames"]), 4)
        for frame in payload["frames"]:
            self.assertEqual(len(frame["observations"]), 1)
            o = frame["observations"][0]
            self.assertEqual(o["label"], "synthetic_proposal")
            self.assertEqual(o["coordinateFrame"], "camera_relative")
            self.assertFalse(o["georegistered"])
            self.assertFalse(o["safetyCriticalApproved"])
            self.assertEqual(o["sourceSha256"], payload["sourceSha256"])
            self.assertEqual(o["frameId"], frame["frameId"])
            self.assertEqual(o["timestampMs"], frame["timestampMs"])
            self.assertIsNotNone(o["depthEstimateM"], "synthetic disparity should resolve")
            # MJPEG compression may perturb the exact synthetic disparity.
            self.assertGreater(o["depthEstimateM"], 2.5)
            self.assertLess(o["depthEstimateM"], 5.0)
            self.assertAlmostEqual(o["cameraPositionM"]["z"], o["depthEstimateM"])
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        # The generated JSON must also pass the *real* JS temporal tracker.
        script = """
import fs from 'node:fs';
import {associateSpatialFrames,temporalReviewPacket,worldsTemporalPreview,
 forensiScopeTemporalEvents,everMapsTemporalDrafts}
 from './public/worlds/spatial-temporal.mjs';
const frames=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).frames;
const tracks=associateSpatialFrames(frames);
const review=temporalReviewPacket(tracks);
const world=worldsTemporalPreview(tracks,frames[0].frameId);
const forensic=forensiScopeTemporalEvents(tracks);
const map=everMapsTemporalDrafts(tracks);
console.log(JSON.stringify({
 tracks:tracks.tracks.length,
 observations:review.events.length,
 custodyVerified:review.chainOfCustodyVerified,
 authoritative:world.metadata.productionAuthoritative,
 collisionAuthority:world.metadata.collisionAuthority,
 forensicReviewed:forensic.every(x=>x.reviewStatus==='requires_human_review'),
 allUnlocated:map.every(x=>x.geometry===null && x.severity===null)
}));
"""
        bridge = subprocess.run(["node", "--input-type=module", "-e", script, str(self.output)],
                                text=True, capture_output=True, timeout=20, check=False)
        self.assertEqual(bridge.returncode, 0, bridge.stderr)
        proof = json.loads(bridge.stdout)
        self.assertEqual(proof["tracks"], 1)
        self.assertEqual(proof["observations"], 4)
        self.assertFalse(proof["custodyVerified"])
        self.assertFalse(proof["authoritative"])
        self.assertFalse(proof["collisionAuthority"])
        self.assertTrue(proof["forensicReviewed"])
        self.assertTrue(proof["allUnlocated"])

    def test_model_sha_tampering_fails_without_creating_output(self):
        manifest = json.loads(self.manifest.read_text())
        manifest["sha256"] = "0" * 64
        self.manifest.write_text(json.dumps(manifest))
        result = subprocess.run(self.command, text=True, capture_output=True,
                                timeout=30, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("model_digest_mismatch", result.stderr)
        self.assertFalse(self.output.exists())

    def test_missing_explicit_rights_fails_without_creating_output(self):
        command = [arg for arg in self.command if arg != "--authorized-source"]
        result = subprocess.run(command, text=True, capture_output=True,
                                timeout=30, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source_authorization_and_rectification_required", result.stderr)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
