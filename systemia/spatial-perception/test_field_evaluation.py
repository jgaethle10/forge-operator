"""Pure-standard-library checks for V5 field evaluation evidence contracts."""
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

import field_evaluation as field


def digest(b):
    return hashlib.sha256(b).hexdigest()


def fixture(z=3.4):
    source, model, calibration = (digest(x) for x in (b"video", b"model", b"calibration"))
    detection = {
        "schema":"evercraft.spatial-perception.observation.v0",
        "id":"stereo-00000000:0", "frameId":"stereo-00000000",
        "timestampMs":0, "label":"target", "detectorConfidence":0.95,
        "box":{"x":20,"y":10,"width":40,"height":30},
        "depthEstimateM":z,
        "cameraPositionM":None if z is None else {"x":0.1,"y":0.1,"z":z},
        "sourceSha256":source, "georegistered":False,
        "safetyCriticalApproved":False
    }
    observations = {
        "schema":"evercraft.spatial-perception.offline-import.v1",
        "sourceSha256":source,"modelSha256":model,
        "calibration":{"fxPx":240.0,"baselineM":0.12,"rectification":"user_asserted_not_verified"},
        "frames":[{"frameId":"stereo-00000000","timestampMs":0,"width":160,"height":100,
                   "observations":[detection]}]
    }
    targets = {
        "schema":"evercraft.spatial-perception.field-targets.v1",
        "sourceSha256":source, "modelSha256":model,
        "calibrationEvidenceSha256":calibration,
        "rigId":"test-rig-001",
        "claimedCalibration":{"fxPx":240.0,"baselineM":0.12},
        "targets":[{"id":"independent-target-1","frameId":"stereo-00000000",
                    "label":"target","box":{"x":20,"y":10,"width":40,"height":30},
                    "referenceCameraAxisDepthM":3.6,"referenceUncertaintyM":0.025,
                    "measurementMethod":"laser_camera_axis"}]
    }
    return observations, targets


class FieldEvaluationTests(unittest.TestCase):
    def test_numeric_report_is_explicitly_uncertified(self):
        obs, targets = fixture()
        report=field.evaluate(obs,targets)
        self.assertEqual(report["schema"],field.REPORT_SCHEMA)
        self.assertEqual(report["summary"]["referenceTargets"],1)
        self.assertEqual(report["summary"]["evaluatedTargets"],1)
        self.assertEqual(report["summary"]["coveragePct"],100)
        self.assertAlmostEqual(report["summary"]["meanAbsoluteErrorM"],0.2)
        self.assertAlmostEqual(report["summary"]["rootMeanSquareErrorM"],0.2)
        self.assertFalse(report["fieldAccuracyCertified"])
        self.assertFalse(report["worldPersistenceAuthorized"])
        self.assertFalse(report["provenance"]["byteIntegrityCheckedLocally"])
        self.assertFalse(report["provenance"]["referenceIndependenceVerified"])

    def test_no_detection_does_not_generate_zero_error(self):
        obs, targets = fixture()
        obs["frames"][0]["observations"]=[]
        report=field.evaluate(obs,targets)
        self.assertEqual(report["summary"]["coveragePct"],0)
        self.assertIsNone(report["summary"]["meanAbsoluteErrorM"])
        self.assertEqual(report["summary"]["noDetection"],1)

    def test_null_depth_does_not_generate_zero_error(self):
        obs, targets=fixture(None)
        report=field.evaluate(obs,targets)
        self.assertEqual(report["summary"]["noDepth"],1)
        self.assertEqual(report["summary"]["evaluatedTargets"],0)
        self.assertIsNone(report["targets"][0]["absoluteErrorM"])

    def test_wrong_label_does_not_count_as_measured(self):
        obs, targets=fixture()
        obs["frames"][0]["observations"][0]["label"]="different"
        report=field.evaluate(obs,targets)
        self.assertEqual(report["summary"]["noDetection"],1)

    def test_ambiguous_detection_is_not_guessed(self):
        obs, targets=fixture()
        d={**obs["frames"][0]["observations"][0],"id":"stereo-00000000:1"}
        obs["frames"][0]["observations"].append(d)
        report=field.evaluate(obs,targets)
        self.assertEqual(report["summary"]["ambiguousDetections"],1)
        self.assertEqual(report["summary"]["evaluatedTargets"],0)
        self.assertIsNone(report["summary"]["rootMeanSquareErrorM"])

    def test_detection_not_reused_for_two_reference_targets(self):
        obs, targets=fixture()
        targets["targets"].append({**targets["targets"][0],"id":"independent-target-2"})
        report=field.evaluate(obs,targets)
        self.assertEqual(report["summary"]["evaluatedTargets"],1)
        self.assertEqual(report["targets"][1]["result"],"duplicate_detection_match")
        self.assertEqual(report["summary"]["coveragePct"],50)

    def test_corrupted_reference_and_calibration_fail(self):
        obs, targets=fixture()
        targets["sourceSha256"]="f"*64
        with self.assertRaisesRegex(ValueError,"target_source_mismatch"):
            field.evaluate(obs,targets)
        obs,targets=fixture()
        targets["claimedCalibration"]["fxPx"]=300.0
        with self.assertRaisesRegex(ValueError,"calibration_focal_mismatch"):
            field.evaluate(obs,targets)
        obs,targets=fixture()
        obs["frames"][0]["observations"][0]["cameraPositionM"]["z"]=4.0
        with self.assertRaisesRegex(ValueError,"inconsistent_camera_depth"):
            field.evaluate(obs,targets)

    def test_authority_escalation_and_out_of_bounds_fail(self):
        obs,targets=fixture()
        obs["frames"][0]["observations"][0]["safetyCriticalApproved"]=True
        with self.assertRaisesRegex(ValueError,"authority_escalation"):
            field.evaluate(obs,targets)
        obs,targets=fixture()
        targets["targets"][0]["box"]["x"]=159
        with self.assertRaisesRegex(ValueError,"out_of_bounds_target_box"):
            field.evaluate(obs,targets)

    def test_full_local_hashes_written_only_with_opt_in(self):
        obs,targets=fixture()
        with tempfile.TemporaryDirectory() as td:
            base=Path(td)
            src=base/"video.avi";src.write_bytes(b"video")
            model=base/"model.onnx";model.write_bytes(b"model")
            calib=base/"calibration.json";calib.write_bytes(b"calibration")
            inp=base/"observations.json";inp.write_text(json.dumps(obs))
            gt=base/"targets.json";gt.write_text(json.dumps(targets))
            out=base/"report.json"
            a=SimpleNamespace(observations=inp,targets=gt,source_video=src,model=model,
                              calibration_evidence=calib,output=out,min_iou=.5,
                              authorized_source=False,independent_references_attested=True)
            with self.assertRaisesRegex(ValueError,"explicit_source_rights"):
                field.run(a)
            self.assertFalse(out.exists())
            a.authorized_source=True
            status=field.run(a)
            self.assertEqual(status["evaluatedTargets"],1)
            report=json.loads(out.read_text())
            self.assertTrue(report["provenance"]["byteIntegrityCheckedLocally"])
            self.assertFalse(report["fieldAccuracyCertified"])
            self.assertEqual(out.stat().st_mode & 0o777,0o600)
            src.write_bytes(b"tampered")
            out.unlink()
            with self.assertRaisesRegex(ValueError,"local_source_sha_mismatch"):
                field.run(a)
            self.assertFalse(out.exists())

    def test_all_targets_need_measured_camera_axis_depth(self):
        obs,targets=fixture()
        targets["targets"][0]["referenceCameraAxisDepthM"]=float("nan")
        with self.assertRaisesRegex(ValueError,"invalid_reference_depth"):
            field.evaluate(obs,targets)
        obs,targets=fixture()
        targets["targets"][0]["measurementMethod"]="guessed_from_dashcam"
        with self.assertRaisesRegex(ValueError,"invalid_reference_method"):
            field.evaluate(obs,targets)


if __name__=="__main__":
    unittest.main()
